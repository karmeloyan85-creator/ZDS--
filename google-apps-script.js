/**
 * ============================================================
 * Google Apps Script — «Зарплата Земский»
 * Backend для облачного хранилища через Google Sheets
 * ============================================================
 *
 * УСТАНОВКА:
 * 1. Создайте Google Таблицу с листами:
 *    - zp_employees
 *    - zp_daily
 *    - zp_advances
 *    - zp_schedule
 *    - zp_settings
 * 2. Вставьте этот код в Apps Script (Расширения → Apps Script)
 * 3. Задайте API_KEY ниже
 * 4. Опубликуйте как веб-приложение (Выполнить как: я, Доступ: любой)
 * 5. Скопируйте URL и вставьте в настройках приложения
 *
 * ⚠️ ВАЖНО: после вставки кода — нажмите «Сохранить» и
 *    «Развернуть» → «Новое развертывание» → «Веб-приложение»
 *    Это исправит проблему с doPost!
 *
 * Структура листов:
 *
 * zp_employees: id | name | position | calcType | fixedDay | fixedMonth | percent | active | appRole | login | pass | permissions
 * zp_daily:     date | emp_id | worked | revenue | patients
 * zp_advances:  emp_id | month | amount
 * zp_schedule:  emp_id | date | status
 * zp_settings:  key | value
 */

// ==================== КОНФИГУРАЦИЯ ====================

const API_KEY = 'zk2026';

// Названия листов (должны совпадать с таблицей)
const SHEETS = {
  employees: 'zp_employees',
  daily:     'zp_daily',
  advances:  'zp_advances',
  schedule:  'zp_schedule',
  settings:  'zp_settings'
};

// Версия API (для совместимости)
const API_VERSION = '2.0';

// ==================== Вспомогательные функции ====================

/**
 * Проверка API-ключа из параметров запроса
 */
function checkKey(e) {
  const key = e.parameter.key || '';
  if (!key || key !== API_KEY) {
    return false;
  }
  return true;
}

/**
 * Получить или создать лист по имени
 */
function getOrCreateSheet(name) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = ss.getSheetByName(name);
  if (!sheet) {
    sheet = ss.insertSheet(name);
    // Добавляем заголовки
    const headers = getSheetHeaders(name);
    if (headers) {
      sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
    }
  }
  return sheet;
}

/**
 * Заголовки для каждого листа
 */
function getSheetHeaders(sheetName) {
  switch (sheetName) {
    case SHEETS.employees:
      return ['id', 'name', 'position', 'calcType', 'fixedDay', 'fixedMonth', 'percent', 'active', 'appRole', 'login', 'pass', 'permissions'];
    case SHEETS.daily:
      return ['date', 'emp_id', 'worked', 'revenue', 'patients'];
    case SHEETS.advances:
      return ['emp_id', 'month', 'amount'];
    case SHEETS.schedule:
      return ['emp_id', 'date', 'status'];
    case SHEETS.settings:
      return ['key', 'value'];
    default:
      return null;
  }
}

/**
 * Прочитать все данные с листа в массив объектов
 */
function readSheet(sheetName) {
  const sheet = getOrCreateSheet(sheetName);
  const data = sheet.getDataRange().getValues();
  if (data.length <= 1) return []; // Только заголовки или пусто

  const headers = data[0];
  const result = [];
  for (let i = 1; i < data.length; i++) {
    const row = data[i];
    // Пропускаем пустые строки
    if (!row[0] && !row[1]) continue;

    const obj = {};
    for (let j = 0; j < headers.length && j < row.length; j++) {
      let val = row[j];
      // Convert Date objects back to strings (Google Sheets may auto-convert)
      if (val instanceof Date) {
        const dy = val.getFullYear();
        const dm = String(val.getMonth() + 1).padStart(2, '0');
        const dd = String(val.getDate()).padStart(2, '0');
        val = dy + '-' + dm + '-' + dd;
      }
      // Handle ISO date strings that Google Sheets may have converted
      else if (typeof val === 'string' && /^\d{4}-\d{2}-\d{2}T/.test(val)) {
        val = val.substring(0, 10); // "2026-05-13T00:00:00.000Z" → "2026-05-13"
      }
      // Handle month-like strings converted to date ISO (e.g. "2026-02-28T21:00:00.000Z" from "2026-02")
      else if (typeof val === 'string' && /^\d{4}-\d{2}-\d{2}T/.test(val) && headers[j] === 'month') {
        val = val.substring(0, 7); // "2026-02-28T21:00:00.000Z" → "2026-02"
      }
      // Преобразуем числа
      if (typeof val === 'number') val = val;
      // Преобразуем логические
      if (typeof val === 'boolean') val = val ? 1 : 0;
      // Десериализуем JSON-строки (например permissions)
      if (typeof val === 'string' && val.startsWith('{') && val.endsWith('}')) {
        try { val = JSON.parse(val); } catch(e) { /* оставляем как строку */ }
      }
      obj[headers[j]] = val;
    }
    result.push(obj);
  }
  return result;
}

/**
 * Очистить и записать данные на лист
 */
function writeSheet(sheetName, data) {
  const sheet = getOrCreateSheet(sheetName);
  const headers = getSheetHeaders(sheetName);
  if (!headers || !headers.length) return;

  // Очищаем лист (кроме заголовков)
  sheet.getRange(2, 1, sheet.getMaxRows(), sheet.getMaxColumns()).clearContent();

  if (!data || !data.length) return;

  // Формируем строки
  const rows = data.map(item => {
    return headers.map(h => {
      let val = item[h];
      if (val === undefined || val === null) return '';
      // Сериализуем объекты/массивы в JSON (например permissions)
      if (typeof val === 'object') return JSON.stringify(val);
      // Force date-like strings to stay as text (prevent DATE_AS_TEXT conversion)
      if (typeof val === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(val)) {
        return val;
      }
      return val;
    });
  });

  sheet.getRange(2, 1, rows.length, rows[0].length).setValues(rows);
  // Force text format on date columns to prevent Google Sheets auto-date conversion
  if (sheetName === SHEETS.daily || sheetName === SHEETS.schedule || sheetName === SHEETS.advances) {
    sheet.getRange(2, 1, rows.length, rows[0].length).setNumberFormat('@');
    // Also clear any date number format that may persist after clearContent
    sheet.getRange(2, 1, sheet.getMaxRows(), sheet.getMaxColumns()).setNumberFormat('General');
    // Re-apply text format to written rows
    sheet.getRange(2, 1, rows.length, rows[0].length).setNumberFormat('@');
  }
}

/**
 * Обновить или добавить записи на лист (по ключевым полям)
 * Для employees — по id
 * Для daily — по date + emp_id
 * Для advances — по month + emp_id
 * Для schedule — по date + emp_id
 */
function upsertSheet(sheetName, data) {
  if (!data || !data.length) return;

  const sheet = getOrCreateSheet(sheetName);
  const headers = getSheetHeaders(sheetName);
  const existing = readSheet(sheetName);

  // Определяем ключевые поля
  let keyFields;
  switch (sheetName) {
    case SHEETS.employees: keyFields = ['id']; break;
    case SHEETS.daily:     keyFields = ['date', 'emp_id']; break;
    case SHEETS.advances:  keyFields = ['month', 'emp_id']; break;
    case SHEETS.schedule:  keyFields = ['date', 'emp_id']; break;
    default: keyFields = []; break;
  }

  // Строим карту существующих записей по ключу
  const existingMap = new Map();
  for (const row of existing) {
    const key = keyFields.map(f => String(row[f] || '')).join('|');
    existingMap.set(key, row);
  }

  // Обновляем или добавляем
  for (const item of data) {
    const key = keyFields.map(f => String(item[f] || '')).join('|');
    if (existingMap.has(key)) {
      // Обновляем существующую запись (перезаписываем все поля)
      const existing = existingMap.get(key);
      for (const h of headers) {
        if (item[h] !== undefined) existing[h] = item[h];
      }
    } else {
      // Добавляем новую
      const newRow = {};
      for (const h of headers) {
        newRow[h] = item[h] !== undefined ? item[h] : '';
      }
      existing.push(newRow);
    }
  }

  // Перезаписываем весь лист
  writeSheet(sheetName, existing);
}

/**
 * Удалить записи по условию
 */
function deleteFromSheet(sheetName, filterFn) {
  const sheet = getOrCreateSheet(sheetName);
  const data = readSheet(sheetName);
  const filtered = data.filter(row => !filterFn(row));
  writeSheet(sheetName, filtered);
}

/**
 * Формат ответа
 */
function jsonResponse(status, data, message) {
  const response = { status: status };
  if (data !== undefined) response.data = data;
  if (message) response.message = message;
  return ContentService.createTextOutput(JSON.stringify(response))
    .setMimeType(ContentService.MimeType.JSON);
}

/**
 * Безопасный разбор JSON из тела POST-запроса
 */
function parseBody(e) {
  try {
    const raw = e.postData ? e.postData.contents : '';
    if (!raw) return null;
    return JSON.parse(raw);
  } catch (err) {
    return null;
  }
}


// ==================== GET — Чтение + запись данных ====================
// GET поддерживает запись через base64-параметр 'payload' (workaround для doPost)
// Клиент кодирует JSON в base64 и передаёт как ?action=bulk_write&key=...&payload=...

function doGet(e) {
  try {
    // ping — проверка доступности (без ключа)
    if (e.parameter.action === 'ping') {
      return jsonResponse('ok', { pong: true, version: API_VERSION, timestamp: new Date().toISOString() });
    }

    // Все остальные действия требуют ключа
    if (!checkKey(e)) {
      return jsonResponse('error', null, 'Неверный API-ключ');
    }

    const action = e.parameter.action || '';

    // ---- GET-based write (payload в base64) ----
    const writeActions = ['write_employees','write_daily','write_advances','write_schedule','write_settings','bulk_write'];
    if (writeActions.indexOf(action) !== -1) {
      return handleWrite(action, e);
    }

    switch (action) {

      case 'read_employees': {
        const data = readSheet(SHEETS.employees);
        return jsonResponse('ok', data);
      }

      case 'read_daily': {
        let data = readSheet(SHEETS.daily);
        // Фильтрация по дате
        if (e.parameter.date) {
          data = data.filter(r => String(r.date) === String(e.parameter.date));
        }
        // Фильтрация по emp_id
        if (e.parameter.emp_id) {
          data = data.filter(r => String(r.emp_id) === String(e.parameter.emp_id));
        }
        return jsonResponse('ok', data);
      }

      case 'read_advances': {
        let data = readSheet(SHEETS.advances);
        // Фильтрация по месяцу
        if (e.parameter.month) {
          data = data.filter(r => String(r.month) === String(e.parameter.month));
        }
        // Фильтрация по emp_id
        if (e.parameter.emp_id) {
          data = data.filter(r => String(r.emp_id) === String(e.parameter.emp_id));
        }
        return jsonResponse('ok', data);
      }

      case 'read_schedule': {
        let data = readSheet(SHEETS.schedule);
        // Фильтрация по emp_id
        if (e.parameter.emp_id) {
          data = data.filter(r => String(r.emp_id) === String(e.parameter.emp_id));
        }
        // Фильтрация по дате
        if (e.parameter.date) {
          data = data.filter(r => String(r.date) === String(e.parameter.date));
        }
        // Фильтрация по месяцу (формат YYYY-MM)
        if (e.parameter.month) {
          const prefix = String(e.parameter.month);
          data = data.filter(r => String(r.date).startsWith(prefix));
        }
        return jsonResponse('ok', data);
      }

      case 'read_settings': {
        const data = readSheet(SHEETS.settings);
        // Форматируем как объект key → value
        const obj = {};
        for (const row of data) {
          if (row.key) obj[row.key] = row.value;
        }
        return jsonResponse('ok', obj);
      }

      case 'read_all': {
        // Возвращает все данные одной порцией
        const employees = readSheet(SHEETS.employees);
        const daily = readSheet(SHEETS.daily);
        const advances = readSheet(SHEETS.advances);
        const schedule = readSheet(SHEETS.schedule);
        const settings = readSheet(SHEETS.settings);

        const settingsObj = {};
        for (const row of settings) {
          if (row.key) settingsObj[row.key] = row.value;
        }

        return jsonResponse('ok', {
          employees,
          daily,
          advances,
          schedule,
          settings: settingsObj
        });
      }

      default:
        return jsonResponse('error', null, 'Неизвестное действие: ' + action);
    }

  } catch (err) {
    return jsonResponse('error', null, 'Ошибка сервера: ' + err.message);
  }
}


// ==================== Unified write handler ====================
// Используется и doGet (payload base64), и doPost (JSON body)

function handleWrite(action, e) {
  let body;

  // Парсим данные: из POST body или из GET payload
  if (e.postData && e.postData.contents) {
    body = parseBody(e);
  } else {
    // GET-based: payload в base64
    const payload = e.parameter.payload;
    if (!payload) {
      return jsonResponse('error', null, 'Отсутствуют данные (payload)');
    }
    try {
      body = JSON.parse(Utilities.base64Decode(payload));
    } catch (decErr) {
      return jsonResponse('error', null, 'Ошибка декодирования payload: ' + decErr.message);
    }
  }

  if (!body || !body.data) {
    return jsonResponse('error', null, 'Отсутствует тело запроса (data)');
  }

  const replace = !!body.replace; // Если true — перезаписать, false — upsert

  switch (action) {

    case 'write_employees': {
      if (replace) {
        writeSheet(SHEETS.employees, body.data);
      } else {
        upsertSheet(SHEETS.employees, body.data);
      }
      return jsonResponse('ok', { written: body.data.length });
    }

    case 'write_daily': {
      if (replace) {
        writeSheet(SHEETS.daily, body.data);
      } else {
        upsertSheet(SHEETS.daily, body.data);
      }
      return jsonResponse('ok', { written: body.data.length });
    }

    case 'write_advances': {
      if (replace) {
        writeSheet(SHEETS.advances, body.data);
      } else {
        upsertSheet(SHEETS.advances, body.data);
      }
      return jsonResponse('ok', { written: body.data.length });
    }

    case 'write_schedule': {
      if (replace) {
        writeSheet(SHEETS.schedule, body.data);
      } else {
        upsertSheet(SHEETS.schedule, body.data);
      }
      return jsonResponse('ok', { written: body.data.length });
    }

    case 'write_settings': {
      // Принимаем как объект {key: value} или массив [{key, value}]
      let rows;
      if (Array.isArray(body.data)) {
        rows = body.data;
      } else {
        rows = Object.entries(body.data).map(([k, v]) => ({ key: k, value: String(v) }));
      }
      if (replace) {
        writeSheet(SHEETS.settings, rows);
      } else {
        upsertSheet(SHEETS.settings, rows);
      }
      return jsonResponse('ok', { written: rows.length });
    }

    case 'bulk_write': {
      // Массовая запись всех данных
      const d = body.data;

      // Сотрудники
      if (d.employees) {
        writeSheet(SHEETS.employees, d.employees);
      }

      // Данные за день
      if (d.daily) {
        writeSheet(SHEETS.daily, d.daily);
      }

      // Авансы
      if (d.advances) {
        writeSheet(SHEETS.advances, d.advances);
      }

      // График
      if (d.schedule) {
        writeSheet(SHEETS.schedule, d.schedule);
      }

      // Настройки
      if (d.settings) {
        let settingsRows;
        if (Array.isArray(d.settings)) {
          settingsRows = d.settings;
        } else {
          settingsRows = Object.entries(d.settings).map(([k, v]) => ({ key: k, value: String(v) }));
        }
        writeSheet(SHEETS.settings, settingsRows);
      }

      let total = 0;
      if (d.employees) total += d.employees.length;
      if (d.daily) total += d.daily.length;
      if (d.advances) total += d.advances.length;
      if (d.schedule) total += d.schedule.length;

      return jsonResponse('ok', { written: total, message: 'Массовая запись выполнена' });
    }

    default:
      return jsonResponse('error', null, 'Неизвестное действие: ' + action);
  }
}


// ==================== POST — Запись данных ====================
// Fallback: если doPost работает, используем его напрямую

function doPost(e) {
  try {
    if (!checkKey(e)) {
      return jsonResponse('error', null, 'Неверный API-ключ');
    }
    return handleWrite(e.parameter.action || '', e);
  } catch (err) {
    return jsonResponse('error', null, 'Ошибка сервера: ' + err.message);
  }
}
