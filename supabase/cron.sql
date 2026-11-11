-- Capybara Control · tareas programadas con Supabase Cron (pg_cron + pg_net)
-- Ejecútalo en Supabase › SQL Editor DESPUÉS del primer despliegue en Vercel (Fase 2).
-- Llama a las rutas protegidas del API: POST {APP_URL}/api/v1/jobs/<tarea> con Authorization: Bearer {CRON_SECRET}.
-- Patrón de la documentación de Supabase: https://supabase.com/docs/guides/functions/schedule-functions
-- pg_cron usa la hora UTC. Bogotá = UTC-5.

create extension if not exists pg_cron;
create extension if not exists pg_net;

-- 1) Guarda la URL de la app y la clave en Vault (una sola vez). La clave = la misma CRON_SECRET de Vercel.
--    Reemplaza los dos valores antes de ejecutar estas dos líneas; no las guardes en el repositorio.
-- select vault.create_secret('https://TU-APP.vercel.app', 'capybara_app_url');
-- select vault.create_secret('LA-MISMA-CRON_SECRET-DE-VERCEL', 'capybara_cron_secret');

-- 2) Tareas
select cron.schedule('capybara-alegra-import', '*/30 * * * *', $$
  select net.http_post(
    url := (select decrypted_secret from vault.decrypted_secrets where name = 'capybara_app_url') || '/api/v1/jobs/alegra-import',
    headers := jsonb_build_object('Content-Type', 'application/json', 'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'capybara_cron_secret')),
    body := '{}'::jsonb
  ) as request_id;
$$);

-- Resumen diario a las 10:30 p. m. de Bogotá (03:30 UTC)
select cron.schedule('capybara-insights-daily', '30 3 * * *', $$
  select net.http_post(
    url := (select decrypted_secret from vault.decrypted_secrets where name = 'capybara_app_url') || '/api/v1/jobs/insights-daily',
    headers := jsonb_build_object('Content-Type', 'application/json', 'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'capybara_cron_secret')),
    body := '{}'::jsonb
  ) as request_id;
$$);

-- Google Sheets: revisa las fuentes activas cada hora
select cron.schedule('capybara-sheets-sync', '5 * * * *', $$
  select net.http_post(
    url := (select decrypted_secret from vault.decrypted_secrets where name = 'capybara_app_url') || '/api/v1/jobs/sheets-sync',
    headers := jsonb_build_object('Content-Type', 'application/json', 'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'capybara_cron_secret')),
    body := '{}'::jsonb
  ) as request_id;
$$);

-- Revisar ejecuciones:   select * from cron.job_run_details order by start_time desc limit 20;
-- Respuestas HTTP:       select * from net._http_response order by created desc limit 20;
-- Quitar una tarea:      select cron.unschedule('capybara-sheets-sync');
