# Bug Report - ZDS-- (Zarplata Zemsky)
# Date: 2026-06-11

## BUG #1 [CRITICAL] - initDefaults() вызывался ДО очистки кэша, данные за май терялись

**Строки:** (было: 817, 821-831)
**Было:** initDefaults() -> cache clear -> seedMayData(). При смене версии кэш очищался ПОСЛЕ initDefaults, удаляя только что созданных сотрудников.
**Исправлено:** cache clear -> initDefaults() -> seedMayData(). Теперь сотрудники создаются ПОСЛЕ очистки.

## BUG #2 [CRITICAL] - Permissions хранились как СТРОКА, а не объект

**Строки:** (было: 795-816)
**Было:** permissions:'{seeSchedule:true,...}' -- строка, не объект. emp.permissions.seeSalaries -> undefined
**Исправлено:** permissions:{seeSchedule:true,...} -- объект. Добавлен parsePerms() для конвертации при загрузке из Supabase.

## BUG #3 [HIGH] - Race condition в doLogin(): Cloud.init() вызывался дважды

**Строки:** (было: 1031-1034)
**Было:** Проверка Cloud.connected перед sync, но Cloud.init() из конца файла ещё не завершился -> повторный init+sync -> ошибки на мобильных
**Исправлено:** Всегда вызывать Cloud.init().then(sync) при логине -- init() сам проверяет connected.

## BUG #4 [HIGH] - exportCSV использовал calcSalary вместо calcSalaryByDays для fixed_day_percent

**Строки:** (было: ~1494)
**Исправлено:** Для calcType==='fixed_day_percent' теперь используется calcSalaryByDays, как и в renderMonthly.

## BUG #5 [MEDIUM] - Schedule конвертация из Supabase: 'working'/'off' вместо 'Р'/'В'

**Строки:** (было: ~547)
**Было:** status=r.start_time||r.end_time?'working':'off' -- несовместимо с UI, ожидающим 'Р','О','В','П'
**Исправлено:** status=r.start_time||r.end_time?'Р':'В'

## BUG #6 [MEDIUM] - GitHub Pages кеширование

**Исправлено:** Добавлены meta-теги Cache-Control/Pragma/Expires=no-cache.

## BUG #7 [LOW] - seedMayData() закомментирован в clear-data handler

**Строки:** (было: 2464-2465)
**Исправлено:** Раскомментирован вызов seedMayData() после initDefaults() при очистке данных.

## BUG #8 [LOW] - Цикл удаления localStorage модифицировался во время итерации

**Исправлено:** Собираем ключи в массив перед удалением.

## APP_VERSION обновлена до 4.0 -- вызывает полную очистку кэша при первом запуске.

---
Итого: 8 багов (2 критических, 2 высоких, 2 средних, 2 низких). Все исправлены.
