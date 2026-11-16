# Онлайн-запись к Валерии (Supabase + GitHub Pages)

## 1. Настройка Supabase
1. Создайте проект на [supabase.com](https://supabase.com).
2. Откройте **SQL Editor** и выполните содержимое файла `supabase/schema.sql`.
3. В **Authentication -> Providers -> Email** убедитесь, что включён вход по Email OTP (6-значный код).
4. Откройте **Project Settings -> API** и скопируйте `Project URL` и `anon public` ключ в `config.js`.
5. Зайдите на сайт под email мастера (Валерии) один раз через OTP-код, затем в **SQL Editor** назначьте ей роль мастера:
   ```sql
   update public.profiles set role = 'master', name = 'Валерия' where email = 'EMAIL_МАСТЕРА';
   ```

## 2. Деплой на GitHub Pages
Файлы `index.html`, `app.js`, `style.css`, `config.js` публикуются напрямую из ветки `main`.
