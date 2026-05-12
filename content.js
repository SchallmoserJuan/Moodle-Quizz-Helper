/**
 * content.js
 * Motor principal de la extensión.
 * Detecta Moodle por DOM, extrae preguntas, consulta Gemini y muestra el overlay.
 */

(function () {
  'use strict';

  // ========================================================================
  // 1. UTILIDADES
  // ========================================================================

  /**
   * Verifica si la página actual parece ser Moodle.
   * Usa múltiples heurísticas para no depender de una sola estructura.
   */
  function isMoodlePage() {
    const checks = [
      () => document.body && document.body.classList.contains('moodle'),
      () => !!document.querySelector('#page-mod-quiz-attempt, #page-mod-quiz-review, #page-mod-quiz-view'),
      () => !!document.querySelector('.que, .qtext, .question, .answer'),
      () => /\/mod\/quiz\//.test(location.href) || /\/question\//.test(location.href),
      () => !!document.querySelector('input[name^="q"][type="radio"], input[name^="q"][type="checkbox"]')
    ];
    return checks.some((fn) => fn());
  }

  /**
   * Genera un hash numérico simple para usar como clave de caché.
   */
  function simpleHash(str) {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash |= 0; // Convierte a entero de 32 bits
    }
    return 'cache_' + Math.abs(hash);
  }

  /**
   * Verifica si el contexto de la extensión sigue siendo válido.
   * Si la extensión se recarga, el contexto se invalida y chrome.runtime
   * deja de estar disponible, causando "Extension context invalidated".
   */
  function isExtensionContextValid() {
    try {
      return !!chrome.runtime.id;
    } catch (e) {
      return false;
    }
  }

  /**
   * Escapa HTML básico para evitar inyección antes de convertir markdown.
   */
  function escapeHtml(text) {
    return text
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
  }

  /**
   * Extrae el código de status HTTP de un mensaje de error string.
   */
  function extractStatusFromMessage(msg) {
    if (!msg) return 0;
    const match = msg.match(/HTTP\s+(\d{3})/);
    return match ? parseInt(match[1], 10) : 0;
  }

  /**
   * Conversión básica de markdown a HTML seguro.
   * Soporta: negrita, cursiva, listas simples y saltos de línea.
   */
  function renderMarkdown(text) {
    let html = escapeHtml(text);

    // Negrita **texto** o __texto__
    html = html.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
    html = html.replace(/__(.+?)__/g, '<strong>$1</strong>');

    // Cursiva *texto* o _texto_
    html = html.replace(/\*(.+?)\*/g, '<em>$1</em>');
    html = html.replace(/_(.+?)_/g, '<em>$1</em>');

    // Listas simples: líneas que empiezan con - o *
    // Primero envolvemos items consecutivos en <ul>
    const listItemRegex = /^([\*\-])\s+(.+)$/gm;
    let hasLists = false;
    html = html.replace(listItemRegex, (match, bullet, content) => {
      hasLists = true;
      return `<li>${content}</li>`;
    });

    if (hasLists) {
      // Envolver grupos de <li> consecutivos
      html = html.replace(/(<li>.*<\/li>(?:\s*|$))+/g, '<ul>$&</ul>');
    }

    // Saltos de línea → <br>
    html = html.replace(/\n/g, '<br>');

    return html;
  }

  // ========================================================================
  // 2. EXTRACCIÓN DE PREGUNTAS
  // ========================================================================

  /**
   * Dado un elemento (por ejemplo, el que recibió doble click),
   * busca hacia arriba el contenedor de la pregunta.
   */
  function findQuestionContainer(target) {
    if (!(target instanceof Element)) return null;

    // Selectores comunes de Moodle (ordenados de más específico a más general)
    const selectors = [
      '.que',
      '.question',
      '[class*="question"]',
      'fieldset',
      '.qtext',
      'article'
    ];

    for (const sel of selectors) {
      const ancestor = target.closest(sel);
      if (ancestor) {
        // Si el selector fue .qtext, subimos un nivel para obtener el contenedor real
        if (sel === '.qtext' && ancestor.parentElement) {
          return ancestor.parentElement;
        }
        return ancestor;
      }
    }

    // Fallback: subir hasta 5 niveles buscando un ancestro que contenga inputs de respuesta
    let node = target;
    for (let i = 0; i < 5 && node; i++) {
      if (
        node.querySelector &&
        node.querySelector('input[type="radio"], input[type="checkbox"], select, textarea')
      ) {
        return node;
      }
      node = node.parentElement;
    }

    return null;
  }

  /**
   * Encuentra la pregunta "activa" para usar con el shortcut.
   * Usa la pregunta más cercana al centro vertical de la viewport.
   */
  function findActiveQuestion() {
    const candidates = document.querySelectorAll('.que, .question, [class*="question"]');
    if (!candidates.length) return null;

    const viewportCenter = window.scrollY + window.innerHeight / 2;
    let best = null;
    let bestDist = Infinity;

    candidates.forEach((el) => {
      const rect = el.getBoundingClientRect();
      const elCenter = window.scrollY + rect.top + rect.height / 2;
      const dist = Math.abs(elCenter - viewportCenter);
      if (dist < bestDist) {
        bestDist = dist;
        best = el;
      }
    });

    return best;
  }

  /**
   * Extrae la información relevante de un contenedor de pregunta.
   * Devuelve: { questionText, options[], contextText }
   */
  function extractQuestionData(container) {
    const data = {
      questionText: '',
      options: [],
      contextText: ''
    };

    if (!container) return data;

    // --- Texto principal de la pregunta ---
    const qtextEl =
      container.querySelector('.qtext, .questiontext, .prompt') ||
      container.querySelector('legend') ||
      container.querySelector('h3, h4, h5');

    if (qtextEl) {
      data.questionText = qtextEl.innerText.trim();
    } else {
      // Fallback: primer párrafo de texto considerable
      const paragraphs = container.querySelectorAll('p, div');
      for (const p of paragraphs) {
        const txt = p.innerText.trim();
        if (txt.length > 10) {
          data.questionText = txt;
          break;
        }
      }
    }

    // --- Opciones (radio, checkbox, labels) ---
    const seenTexts = new Set();
    const inputSelector = 'input[type="radio"], input[type="checkbox"]',
          inputs = container.querySelectorAll(inputSelector);

    inputs.forEach((input) => {
      let labelText = '';
      const id = input.id;

      if (id) {
        const label = container.querySelector(`label[for="${CSS.escape(id)}"]`);
        if (label) labelText = label.innerText.trim();
      }

      if (!labelText) {
        // Buscar label ancestro
        let parent = input.parentElement;
        for (let i = 0; i < 3 && parent; i++) {
          if (parent.tagName === 'LABEL') {
            labelText = parent.innerText.trim();
            break;
          }
          parent = parent.parentElement;
        }
      }

      if (!labelText) {
        // Si no hay label, usar el texto del contenedor padre (li, div.row, etc.)
        let parent = input.parentElement;
        if (parent) labelText = parent.innerText.trim().replace(/^\s*[a-zA-Z]\.[\s)]+/, '').trim();
      }

      if (labelText && !seenTexts.has(labelText)) {
        seenTexts.add(labelText);
        data.options.push({ text: labelText });
      }
    });

    // Si no hay inputs pero sí listas de opciones tipo <li class="answer">
    if (data.options.length === 0) {
      const answerItems = container.querySelectorAll('.answer li, .answer div, [class*="option"]');
      answerItems.forEach((item) => {
        const txt = item.innerText.trim();
        if (txt && !seenTexts.has(txt)) {
          seenTexts.add(txt);
          data.options.push({ text: txt });
        }
      });
    }

    // --- Contexto adicional (texto visible que no sea pregunta ni opciones) ---
    const allText = container.innerText || '';
    const cleanContext = allText
      .replace(data.questionText, '')
      .replace(data.options.map((o) => o.text).join(' '), '')
      .trim();

    if (cleanContext.length > 10) {
      data.contextText = cleanContext.substring(0, 800); // Limitar para no saturar el prompt
    }

    return data;
  }

  // ========================================================================
  // 3. CACHE (chrome.storage.local)
  // ========================================================================

  function getCached(hash, callback) {
    if (!isExtensionContextValid()) {
      callback(null);
      return;
    }
    try {
      chrome.storage.local.get([hash], (result) => {
        if (chrome.runtime.lastError) {
          console.error('[Moodle Study Helper] Error de cache:', chrome.runtime.lastError);
          callback(null);
          return;
        }
        callback(result[hash] || null);
      });
    } catch (e) {
      console.error('[Moodle Study Helper] Error leyendo cache:', e);
      callback(null);
    }
  }

  function setCached(hash, value) {
    if (!isExtensionContextValid()) return;
    try {
      const payload = {};
      payload[hash] = value;
      chrome.storage.local.set(payload);
    } catch (e) {
      console.error('[Moodle Study Helper] Error guardando cache:', e);
    }
  }

  // ========================================================================
  // 4. APIs
  // ========================================================================

  /**
   * Llama a la API de Gemini via fetch.
   * Incluye timeout (30s) y retries básicos (2 intentos).
   */
  async function callGemini(apiKey, model, prompt) {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
    const maxRetries = 2;
    const timeoutMs = 30000;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

      try {
        const response = await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [
              {
                parts: [{ text: prompt }]
              }
            ]
          }),
          signal: controller.signal
        });

        clearTimeout(timeoutId);

        if (!response.ok) {
          const errText = await response.text();
          const err = new Error(`HTTP ${response.status}: ${errText}`);
          err.status = response.status;
          throw err;
        }

        const json = await response.json();

        if (json.error) {
          const err = new Error(json.error.message || 'Error desconocido de Gemini');
          err.status = json.error.code || 500;
          throw err;
        }

        const answer = json.candidates?.[0]?.content?.parts?.[0]?.text;
        if (!answer) {
          throw new Error('La respuesta de Gemini no contiene texto');
        }

        return answer;
      } catch (err) {
        clearTimeout(timeoutId);

        // Si es timeout o error 5xx, reintentamos
        const isRetryable =
          err.name === 'AbortError' ||
          (err.status && err.status >= 500 && err.status < 600);

        if (isRetryable && attempt < maxRetries) {
          console.warn(`[Moodle Study Helper] Reintento ${attempt}/${maxRetries} tras error:`, err.message);
          await new Promise((r) => setTimeout(r, 1000 * attempt)); // Backoff exponencial simple
          continue;
        }

        throw err;
      }
    }

    // Nunca debería llegar acá, pero por seguridad
    throw new Error('Todos los intentos fallaron');
  }

  /**
   * Llama a la API de Groq via fetch.
   * Formato OpenAI-compatible. Incluye timeout (30s) y retries básicos.
   */
  async function callGroq(apiKey, model, prompt) {
    const url = 'https://api.groq.com/openai/v1/chat/completions';
    const maxRetries = 2;
    const timeoutMs = 30000;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

      try {
        const response = await fetch(url, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${apiKey}`
          },
          body: JSON.stringify({
            model: model,
            messages: [{ role: 'user', content: prompt }],
            temperature: 0.2
          }),
          signal: controller.signal
        });

        clearTimeout(timeoutId);

        if (!response.ok) {
          const errText = await response.text();
          const err = new Error(`HTTP ${response.status}: ${errText}`);
          err.status = response.status;
          throw err;
        }

        const json = await response.json();

        if (json.error) {
          const err = new Error(json.error.message || 'Error desconocido de Groq');
          err.status = json.error.code || 500;
          throw err;
        }

        const answer = json.choices?.[0]?.message?.content;
        if (!answer) {
          throw new Error('La respuesta de Groq no contiene texto');
        }

        return answer;
      } catch (err) {
        clearTimeout(timeoutId);

        const isRetryable =
          err.name === 'AbortError' ||
          (err.status && err.status >= 500 && err.status < 600);

        if (isRetryable && attempt < maxRetries) {
          console.warn(`[Moodle Study Helper] Reintento ${attempt}/${maxRetries} tras error Groq:`, err.message);
          await new Promise((r) => setTimeout(r, 1000 * attempt));
          continue;
        }

        throw err;
      }
    }

    throw new Error('Todos los intentos fallaron');
  }

  /**
   * Llama a una API genérica con formato OpenAI-compatible.
   * Permite usar GPT-4, Claude (vía OpenRouter), DeepSeek, Perplexity, Ollama local, etc.
   */
  async function callOpenAICompatible(apiKey, baseUrl, model, prompt) {
    const url = baseUrl.replace(/\/$/, '') + '/chat/completions';
    const maxRetries = 2;
    const timeoutMs = 30000;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

      try {
        const response = await fetch(url, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${apiKey}`
          },
          body: JSON.stringify({
            model: model,
            messages: [{ role: 'user', content: prompt }],
            temperature: 0.2
          }),
          signal: controller.signal
        });

        clearTimeout(timeoutId);

        if (!response.ok) {
          const errText = await response.text();
          const err = new Error(`HTTP ${response.status}: ${errText}`);
          err.status = response.status;
          throw err;
        }

        const json = await response.json();

        if (json.error) {
          const err = new Error(json.error.message || 'Error desconocido de la API');
          err.status = json.error.code || 500;
          throw err;
        }

        const answer = json.choices?.[0]?.message?.content;
        if (!answer) {
          throw new Error('La respuesta no contiene texto');
        }

        return answer;
      } catch (err) {
        clearTimeout(timeoutId);

        const isRetryable =
          err.name === 'AbortError' ||
          (err.status && err.status >= 500 && err.status < 600);

        if (isRetryable && attempt < maxRetries) {
          console.warn(`[Moodle Study Helper] Reintento ${attempt}/${maxRetries}:`, err.message);
          await new Promise((r) => setTimeout(r, 1000 * attempt));
          continue;
        }

        throw err;
      }
    }

    throw new Error('Todos los intentos fallaron');
  }

  /**
   * Detecta si la pregunta requiere marcar múltiples opciones.
   */
  function isMultipleAnswerQuestion(questionText, options) {
    const text = questionText.toLowerCase();
    const multiIndicators = [
      'indique cuales', 'indicá cuales', 'indique cuáles', 'indicá cuáles',
      'seleccione todas', 'seleccioná todas',
      'marque aquellos', 'marcá aquellos', 'marque aquellas', 'marcá aquellas',
      'marque todos', 'marcá todos',
      'cuales de los siguientes', 'cuáles de los siguientes',
      'cuales corresponden', 'cuáles corresponden',
      'rubros corresponden', 'items corresponden', 'ítems corresponden',
      'multiple respuesta', 'múltiple respuesta',
      'seleccion multiple', 'selección múltiple',
      'mas de una', 'más de una',
      'todas las que correspondan', 'todas las correctas'
    ];
    return multiIndicators.some((indicator) => text.includes(indicator));
  }

  /**
   * Detecta el área académica de la pregunta para agregar contexto especializado.
   */
  function detectAcademicArea(questionText, options) {
    const text = (questionText + ' ' + options.map((o) => o.text).join(' ')).toLowerCase();

    const areas = [
      {
        name: 'DERECHO LABORAL',
        terms: ['despido', 'indemnización', 'indemnizacion', 'preaviso', 's.a.c.', 'sac', 'aguinaldo', 'vacaciones proporcionales', 'contrato laboral', 'reclamo indemnizatorio', 'antigüedad', 'derecho laboral', 'ley de contrato de trabajo', 'lct', 'artículo', 'articulo', 'ley ', 'decreto', 'jurisprudencia', 'despido sin causa', 'despido justificado', 'multa', 'sanción', 'sancion', 'mala praxis', 'derecho procesal', 'laboral', 'empleador', 'trabajador', 'liquidación', 'liquidacion', 'finalización', 'finalizacion', 'sueldo', 'salario', 'remuneración']
      },
      {
        name: 'DERECHO CIVIL Y COMERCIAL',
        terms: ['contrato', 'obligaciones', 'propiedad', 'posesión', 'posesion', 'sucesiones', 'familia', 'divorcio', 'alimentos', 'daños', 'responsabilidad civil', 'código civil', 'persona jurídica', 'sociedad', 'título de crédito', 'cheque', 'pagaré', 'pagare', 'letra de cambio', 'fideicomiso', 'usufructo', 'servidumbre', 'hipoteca', 'prenda', 'codeudor', 'garantía', 'garantia', 'mandato', 'comisión', 'comision', 'depósito', 'deposito']
      },
      {
        name: 'PROGRAMACIÓN Y DESARROLLO DE SOFTWARE',
        terms: ['javascript', 'python', 'java', 'c++', 'c#', 'php', 'ruby', 'go ', 'rust', 'typescript', 'html', 'css', 'sql', 'api', 'rest', 'graphql', 'json', 'xml', 'docker', 'kubernetes', 'git', 'github', 'algoritmo', 'función', 'funcion', 'variable', 'clase', 'objeto', 'herencia', 'polimorfismo', 'encapsulamiento', 'recursión', 'recursion', 'bucle', 'loop', 'array', 'lista', 'diccionario', 'hashmap', 'stack', 'queue', 'árbol', 'arbol', 'grafo', 'base de datos', 'query', 'frontend', 'backend', 'fullstack', 'framework', 'react', 'angular', 'vue', 'node.js', 'nodejs', 'express', 'django', 'spring', 'laravel']
      },
      {
        name: 'REDES Y TELECOMUNICACIONES',
        terms: ['tcp/ip', 'ip ', 'protocolo', 'router', 'switch', 'firewall', 'subnet', 'máscara', 'mascara', 'dns', 'dhcp', 'http', 'https', 'ftp', 'ssh', 'vlan', 'lan', 'wan', 'man', 'wifi', 'ethernet', 'packet', 'paquete', 'latencia', 'ancho de banda', 'bandwidth', 'osi', 'capa de red', 'capa de transporte', 'capa de aplicación', 'capa de aplicacion', 'enrutamiento', 'routing', 'switching', 'cableado estructurado', 'fibra óptica', 'fibra optica', 'cisco', 'juniper', 'ospf', 'bgp', 'nat', 'pat', 'vpn', 'mpls', 'qos']
      },
      {
        name: 'GESTIÓN DE PROYECTOS',
        terms: ['pmbok', 'agile', 'scrum', 'kanban', 'sprint', 'backlog', 'product owner', 'scrum master', 'burndown', 'wbs', 'carta gantt', 'gantt', 'cronograma', 'ruta crítica', 'ruta critica', 'pert', 'cpm', 'roi', 'npv', 'van', 'triángulo de hierro', 'triangulo de hierro', 'alcance', 'tiempo', 'costo', 'calidad', 'riesgo', 'stakeholder', 'comunicación', 'comunicacion', 'adquisición', 'adquisicion', 'recursos humanos', 'integración', 'integracion', 'pmi', 'project management', 'gestión de proyectos', 'gestion de proyectos', 'planificación', 'planificacion', 'ejecución', 'ejecucion', 'monitoreo', 'cierre']
      },
      {
        name: 'BASES DE DATOS',
        terms: ['sql', 'mysql', 'postgresql', 'oracle', 'mongodb', 'nosql', 'tabla', 'tablas', 'relación', 'relacion', 'clave primaria', 'clave foránea', 'clave foranea', 'primary key', 'foreign key', 'índice', 'indice', 'index', 'normalización', 'normalizacion', 'join', 'inner join', 'left join', 'right join', 'outer join', 'subquery', 'procedimiento almacenado', 'trigger', 'vista', 'view', 'transacción', 'transaccion', 'acid', 'commit', 'rollback', 'backup', 'restore', 'replicación', 'replicacion', 'sharding', 'partitioning', 'erd', 'modelo entidad-relación', 'modelo entidad-relacion', 'ddl', 'dml', 'dcl']
      },
      {
        name: 'CONTABILIDAD Y FINANZAS',
        terms: ['activo', 'pasivo', 'patrimonio neto', 'estado de situación', 'estado de resultado', 'balance general', 'cuenta contable', 'asiento contable', 'debe', 'haber', 'amortización', 'amortizacion', 'depreciación', 'depreciacion', 'inventario', 'fifo', 'lifo', 'tir', 'van', 'npv', 'irr', 'roi', 'roe', 'roa', 'ebitda', 'ebit', 'flujo de caja', 'cash flow', 'working capital', 'capital de trabajo', 'ratio', 'razón', 'razon', 'liquidez', 'solvencia', 'rentabilidad', 'punto de equilibrio', 'break-even', 'costo fijo', 'costo variable', 'margen', 'presupuesto', 'presupuesto', 'auditoría', 'auditoria', 'impuesto', 'iva', 'ganancias', 'bienes personales', 'afip', 'sii']
      },
      {
        name: 'MEDICINA Y SALUD',
        terms: ['diagnóstico', 'diagnostico', 'tratamiento', 'síntoma', 'sintoma', 'signo', 'patología', 'patologia', 'enfermedad', 'síndrome', 'sindrome', 'anatomía', 'anatomia', 'fisiología', 'fisiologia', 'histología', 'histologia', 'embriología', 'embriologia', 'bioquímica', 'bioquimica', 'farmaco', 'fármaco', 'medicamento', 'dosis', 'vía de administración', 'via de administracion', 'contraindicación', 'contraindicacion', 'efecto adverso', 'interacción', 'interaccion', 'epidemiología', 'epidemiologia', 'inmunología', 'inmunologia', 'microbiología', 'microbiologia', 'parasitología', 'parasitologia', 'cirugía', 'cirugia', 'ginecología', 'ginecologia', 'pediatría', 'pediatria', 'cardiología', 'cardiologia', 'neurología', 'neurologia', 'oncología', 'oncologia', 'radiología', 'radiologia']
      },
      {
        name: 'INGENIERÍA Y MATEMÁTICAS',
        terms: ['cálculo', 'calculo', 'derivada', 'integral', 'límite', 'limite', 'función', 'funcion', 'ecuación', 'ecuacion', 'diferencial', 'matriz', 'vector', 'determinante', 'eigenvalor', 'eigenvector', 'probabilidad', 'estadística', 'estadistica', 'distribución', 'distribucion', 'muestreo', 'intervalo de confianza', 'prueba de hipótesis', 'regresión', 'regresion', 'correlación', 'correlacion', 'física', 'fisica', 'mecánica', 'mecanica', 'termodinámica', 'termodinamica', 'electromagnetismo', 'óptica', 'optica', 'química', 'quimica', 'estructura', 'resistencia de materiales', 'estática', 'estatica', 'dinámica', 'dinamica', 'circuito', 'electrónica', 'electronica', 'control automático', 'control automatico', 'señales', 'señales', 'sistemas']
      }
    ];

    let bestArea = null;
    let bestScore = 0;

    for (const area of areas) {
      const score = area.terms.reduce((count, term) => {
        return text.includes(term) ? count + 1 : count;
      }, 0);
      if (score > bestScore) {
        bestScore = score;
        bestArea = area;
      }
    }

    return bestArea ? bestArea.name : null;
  }

  /**
   * Construye el prompt que se envía a la API.
   * Adapta el formato según el tipo de pregunta y área académica detectados.
   */
  function buildPrompt(data) {
    const isMulti = isMultipleAnswerQuestion(data.questionText, data.options);
    const area = detectAcademicArea(data.questionText, data.options);

    let prompt = '';

    if (area) {
      prompt += `Respondé esta pregunta de ${area}.\n`;
      prompt += 'Usá terminología técnica precisa y fundamentos teóricos sólidos de esta área.\n\n';
    }

    prompt += 'Respondé esta pregunta de un quiz académico de Moodle de forma breve y clara.\n\n';

    if (isMulti) {
      prompt += 'ESTA PREGUNTA REQUIERE MARCAR VARIAS OPCIONES CORRECTAS (no solo una).\n';
      prompt += 'Analizá CADA opción individualmente y decidí si corresponde o no.\n';
      prompt += 'Respondé listando SOLO las opciones que efectivamente corresponden, con su letra y texto.\n';
      prompt += 'Después, dá una breve explicación general de por qué esas opciones son correctas.\n\n';
    } else {
      prompt += 'Indicá la opción correcta con su letra y texto, y una breve explicación de por qué.\n\n';
    }

    prompt += `Pregunta:\n${data.questionText}\n`;

    if (data.options.length > 0) {
      prompt += '\nOpciones:\n';
      data.options.forEach((opt, idx) => {
        prompt += `${String.fromCharCode(65 + idx)}) ${opt.text}\n`;
      });
    }

    if (data.contextText) {
      prompt += `\nContexto:\n${data.contextText}\n`;
    }

    return prompt;
  }

  // ========================================================================
  // 5. OVERLAY UI
  // ========================================================================

  const OVERLAY_ID = 'moodle-helper-overlay';

  function createOverlay() {
    if (document.getElementById(OVERLAY_ID)) return;

    const overlay = document.createElement('div');
    overlay.id = OVERLAY_ID;
    overlay.className = 'moodle-helper-hidden';
    overlay.setAttribute('role', 'dialog');
    overlay.setAttribute('aria-label', 'Respuesta del asistente');

    overlay.innerHTML = `
      <div class="moodle-helper-header">
        <span class="moodle-helper-title">Moodle Study Helper</span>
        <div class="moodle-helper-actions">
          <button class="moodle-helper-btn" id="moodle-helper-regenerate" title="Generar nueva respuesta">Regenerar</button>
          <button class="moodle-helper-btn" id="moodle-helper-copy" title="Copiar respuesta">Copiar</button>
          <button class="moodle-helper-btn" id="moodle-helper-close" title="Cerrar">Cerrar</button>
        </div>
      </div>
      <div class="moodle-helper-body">
        <div class="moodle-helper-loading" id="moodle-helper-loading">
          <div class="moodle-helper-spinner"></div>
          <span>Analizando pregunta...</span>
        </div>
        <div class="moodle-helper-content" id="moodle-helper-content"></div>
      </div>
    `;

    document.body.appendChild(overlay);

    // Botón cerrar
    document.getElementById('moodle-helper-close').addEventListener('click', hideOverlay);

    // Botón copiar
    document.getElementById('moodle-helper-copy').addEventListener('click', copyToClipboard);

    // Botón regenerar
    document.getElementById('moodle-helper-regenerate').addEventListener('click', forceRegenerate);

    // Drag
    const header = overlay.querySelector('.moodle-helper-header');
    setupDrag(header, overlay);
  }

  function showOverlay() {
    createOverlay();
    const overlay = document.getElementById(OVERLAY_ID);
    overlay.classList.remove('moodle-helper-hidden');
    overlay.classList.add('moodle-helper-visible');
  }

  function hideOverlay() {
    const overlay = document.getElementById(OVERLAY_ID);
    if (!overlay) return;
    overlay.classList.remove('moodle-helper-visible');
    overlay.classList.add('moodle-helper-hidden');
  }

  function setLoading(isLoading) {
    const loading = document.getElementById('moodle-helper-loading');
    const content = document.getElementById('moodle-helper-content');
    if (!loading || !content) return;

    if (isLoading) {
      loading.style.display = 'flex';
      content.style.display = 'none';
    } else {
      loading.style.display = 'none';
      content.style.display = 'block';
    }
  }

  function updateOverlayContent(markdownText) {
    const content = document.getElementById('moodle-helper-content');
    if (!content) return;
    content.innerHTML = renderMarkdown(markdownText);
  }

  function copyToClipboard() {
    const content = document.getElementById('moodle-helper-content');
    if (!content) return;

    const text = content.innerText || '';
    navigator.clipboard.writeText(text).then(() => {
      const btn = document.getElementById('moodle-helper-copy');
      const original = btn.textContent;
      btn.textContent = 'Copiado';
      setTimeout(() => {
        if (btn) btn.textContent = original;
      }, 1500);
    });
  }

  /**
   * Permite arrastrar el overlay desde el header.
   */
  function setupDrag(handle, element) {
    let isDragging = false;
    let startX = 0;
    let startY = 0;
    let initialLeft = 0;
    let initialTop = 0;

    handle.addEventListener('mousedown', (e) => {
      isDragging = true;
      startX = e.clientX;
      startY = e.clientY;
      const rect = element.getBoundingClientRect();
      initialLeft = rect.left;
      initialTop = rect.top;
      element.style.transition = 'none';
    });

    document.addEventListener('mousemove', (e) => {
      if (!isDragging) return;
      const dx = e.clientX - startX;
      const dy = e.clientY - startY;
      element.style.left = `${initialLeft + dx}px`;
      element.style.top = `${initialTop + dy}px`;
      element.style.right = 'auto';
    });

    document.addEventListener('mouseup', () => {
      if (isDragging) {
        isDragging = false;
        element.style.transition = '';
      }
    });
  }

  // ========================================================================
  // 6. FLUJO PRINCIPAL
  // ========================================================================

  // Variables para permitir regeneración de la última pregunta
  let currentQuestionData = null;
  let currentConfig = null;

  async function processQuestion(targetOrContainer) {
    let container = null;

    if (targetOrContainer instanceof Element) {
      container = findQuestionContainer(targetOrContainer);
    } else {
      container = findActiveQuestion();
    }

    if (!container) {
      // eslint-disable-next-line no-alert
      alert('No se detectó una pregunta de Moodle en esta zona.');
      return;
    }

    const data = extractQuestionData(container);
    if (!data.questionText || data.questionText.trim().length < 3) {
      // eslint-disable-next-line no-alert
      alert('No se pudo extraer el texto de la pregunta.');
      return;
    }

    showOverlay();
    setLoading(true);

    // Verificar que el contexto de la extensión siga válido
    if (!isExtensionContextValid()) {
      setLoading(false);
      updateOverlayContent(
        '**Extensión recargada**\n\n' +
        'La extensión se actualizó o recargó.\n' +
        '**Recargá la página (F5)** para que el content script se reinyecte correctamente.'
      );
      return;
    }

    // Generar hash de caché combinando pregunta + opciones
    const cacheKey = simpleHash(
      data.questionText + data.options.map((o) => o.text).join('|')
    );

    // Leer configuración
    let config;
    try {
      config = await new Promise((resolve) => {
        chrome.storage.local.get([
          'provider',
          'geminiApiKey', 'geminiModel',
          'groqApiKey', 'groqModel',
          'customApiKey', 'customBaseUrl', 'customModel'
        ], resolve);
      });
    } catch (e) {
      setLoading(false);
      updateOverlayContent(
        '**Error de comunicación**\n\n' +
        'No se pudo leer la configuración de la extensión.\n' +
        'Probá recargar la página (F5).'
      );
      return;
    }

    const provider = config.provider || 'gemini';
    let apiKey, model, baseUrl;

    if (provider === 'groq') {
      apiKey = config.groqApiKey;
      model = config.groqModel || 'openai/gpt-oss-120b';
    } else if (provider === 'openai-compatible') {
      apiKey = config.customApiKey;
      model = config.customModel || '';
      baseUrl = config.customBaseUrl || '';
    } else {
      apiKey = config.geminiApiKey;
      model = config.geminiModel || 'gemini-2.5-flash';
    }

    if (!apiKey) {
      const providerName = provider === 'groq' ? 'Groq' : provider === 'openai-compatible' ? 'la API configurada' : 'Gemini';
      setLoading(false);
      updateOverlayContent(
        '**Error de configuración**\n\n' +
        `No se encontró una API Key para ${providerName}.\n` +
        'Abrí las opciones de la extensión (click derecho en el ícono → Opciones) y pegá tu clave.'
      );
      return;
    }

    // Guardar datos actuales para permitir regeneración
    currentQuestionData = data;
    currentConfig = { provider, apiKey, model, baseUrl };

    // Verificar caché
    getCached(cacheKey, async (cached) => {
      if (cached) {
        setLoading(false);
        updateOverlayContent(cached);
        return;
      }

      const prompt = buildPrompt(data);

      try {
        let answer;
        if (provider === 'groq') {
          answer = await callGroq(apiKey, model, prompt);
        } else if (provider === 'openai-compatible') {
          answer = await callOpenAICompatible(apiKey, baseUrl, model, prompt);
        } else {
          answer = await callGemini(apiKey, model, prompt);
        }
        setLoading(false);
        updateOverlayContent(answer);
        setCached(cacheKey, answer);
      } catch (err) {
        setLoading(false);
        console.error('[Moodle Study Helper] Error de API:', err);

        const providerName = provider === 'groq' ? 'Groq' : 'Gemini';
        let errorMsg = '';
        const statusCode = err.status || extractStatusFromMessage(err.message);

        if (statusCode === 429) {
          errorMsg =
            '**Límite de cuota excedido (Error 429)**\n\n' +
            `Tu API Key de ${providerName} alcanzó el máximo de requests permitidos.\n\n` +
            '**Soluciones:**\n' +
            '1. Esperá unos minutos e intentá de nuevo (límite por minuto).\n' +
            '2. Si el límite es diario, tendrás que esperar hasta mañana.\n' +
            `3. Revisá tu uso en la consola de ${providerName}.\n\n` +
            `Detalle técnico: ${err.message}`;
        } else if (statusCode === 404) {
          errorMsg =
            '**Modelo no encontrado (Error 404)**\n\n' +
            'El modelo seleccionado no existe o no está habilitado para tu API Key.\n\n' +
            '**Soluciones:**\n' +
            '1. Verificá que el modelo seleccionado sea válido.\n' +
            '2. Probá con otro modelo del dropdown de opciones.\n\n' +
            `Detalle técnico: ${err.message}`;
        } else if (statusCode === 401 || statusCode === 403) {
          errorMsg =
            '**Acceso denegado (Error 401/403)**\n\n' +
            `Tu API Key de ${providerName} no tiene permisos o es incorrecta.\n\n` +
            '**Soluciones:**\n' +
            '1. Verificá que la API Key sea correcta.\n' +
            `2. Asegurate de haber habilitado la API en la consola de ${providerName}.\n\n` +
            `Detalle técnico: ${err.message}`;
        } else if (err.name === 'AbortError') {
          errorMsg =
            '**Tiempo de espera agotado**\n\n' +
            `La solicitud a ${providerName} tardó más de 30 segundos.\n\n` +
            '**Soluciones:**\n' +
            '1. Verificá tu conexión a internet.\n' +
            '2. Intentá de nuevo (puede ser un problema temporal de la API).\n' +
            '3. Probá con un modelo más rápido.';
        } else {
          errorMsg =
            `**Error al contactar a ${providerName}**\n\n` +
            `${err.message}\n\n` +
            'Verificá tu API Key, tu conexión a internet o intentá de nuevo más tarde.';
        }

        updateOverlayContent(errorMsg);
      }
    });
  }

  /**
   * Fuerza una nueva llamada a Gemini para la pregunta actual,
   * ignorando la caché existente.
   */
  async function forceRegenerate() {
    if (!currentQuestionData || !currentConfig) {
      updateOverlayContent(
        '**No hay pregunta activa**\n\n' +
        'Hacé doble click en una pregunta primero para poder regenerarla.'
      );
      return;
    }

    if (!isExtensionContextValid()) {
      updateOverlayContent(
        '**Extensión recargada**\n\n' +
        'La extensión se actualizó. Recargá la página (F5).'
      );
      return;
    }

    setLoading(true);

    const cacheKey = simpleHash(
      currentQuestionData.questionText + currentQuestionData.options.map((o) => o.text).join('|')
    );

    const prompt = buildPrompt(currentQuestionData);

    try {
      let answer;
      if (currentConfig.provider === 'groq') {
        answer = await callGroq(currentConfig.apiKey, currentConfig.model, prompt);
      } else if (currentConfig.provider === 'openai-compatible') {
        answer = await callOpenAICompatible(currentConfig.apiKey, currentConfig.baseUrl, currentConfig.model, prompt);
      } else {
        answer = await callGemini(currentConfig.apiKey, currentConfig.model, prompt);
      }
      setLoading(false);
      updateOverlayContent(answer);
      setCached(cacheKey, answer);
    } catch (err) {
      setLoading(false);
      console.error('[Moodle Study Helper] Error al regenerar:', err);

      let errorMsg = '';
      const statusCode = err.status || extractStatusFromMessage(err.message);

      if (statusCode === 429) {
        errorMsg =
          '**Límite de cuota excedido (Error 429)**\n\n' +
          'Esperá unos minutos antes de intentar regenerar.\n\n' +
          `Detalle: ${err.message}`;
      } else {
        errorMsg =
          '**Error al regenerar**\n\n' +
          `${err.message}\n\n` +
          'Intentá de nuevo más tarde.';
      }

      updateOverlayContent(errorMsg);
    }
  }

  // ========================================================================
  // 7. LISTENERS
  // ========================================================================

  document.addEventListener('dblclick', (e) => {
    if (!isMoodlePage()) return;

    // No actuar si el doble click fue dentro del propio overlay
    if (e.target.closest('#' + OVERLAY_ID)) return;

    // Ignorar elementos interactivos nativos para no interferir con la UI de Moodle
    const tag = e.target.tagName;
    const isEditable = e.target.isContentEditable;
    if (['INPUT', 'TEXTAREA', 'SELECT', 'BUTTON', 'A'].includes(tag) || isEditable) {
      return;
    }

    processQuestion(e.target);
  });

  chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === 'resolveCurrentQuestion') {
      if (!isExtensionContextValid()) {
        sendResponse({ success: false, error: 'Extension context invalidated. Reload the page.' });
        return true;
      }
      if (!isMoodlePage()) {
        sendResponse({ success: false, error: 'No parece ser una página de Moodle' });
        return true;
      }
      processQuestion(null);
      sendResponse({ success: true });
    }
    return true; // Keep channel open for async
  });

  // ========================================================================
  // 8. MUTATION OBSERVER (SPA / quizzes dinámicos)
  // ========================================================================

  let moodleDetected = isMoodlePage();

  const observer = new MutationObserver(() => {
    if (!moodleDetected && isMoodlePage()) {
      moodleDetected = true;
      console.log('[Moodle Study Helper] Página Moodle detectada dinámicamente.');
    }
  });

  if (document.body) {
    observer.observe(document.body, { childList: true, subtree: true });
  } else {
    window.addEventListener('DOMContentLoaded', () => {
      observer.observe(document.body, { childList: true, subtree: true });
    });
  }

  console.log('[Moodle Study Helper] Content script cargado.');
})();
