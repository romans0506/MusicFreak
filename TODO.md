# TODO

## Монетизация: Freemium (MusikFreak Pro)

> Архитектурный план. Источник правды по подписке — Stripe, а не клиент.
> Все entitlement-проверки делаются на сервере (server components / route handlers),
> рядом с уже существующим auth-gate (`createClient()` + `getUser()`).

### ⚠️ Ограничения, помнить
- Spotify Developer Terms: нельзя продавать доступ к контенту Spotify / строить конкурирующий сервис / вешать рекламу поверх Spotify-данных. Монетизируем **свой** контент (игры, геймификация, косметика, статистика поверх собственного `play_history`).
- Приложение в **development mode** (~25 юзеров). Для запуска монетизации нужен **Extended Quota Mode** (заявка + ревью Spotify).

### Фаза 0 — фундамент
- [ ] Таблица `subscriptions` (`user_id` PK, `status` free|active|past_due|canceled, `plan`, `stripe_customer_id`, `stripe_subscription_id`, `current_period_end`, `updated_at`). RLS: owner-only SELECT, **никакого клиентского write** (пишет только service-role вебхук).
- [ ] `src/lib/entitlements.ts`: `getTier(supabase): "free"|"pro"`, `isPro(supabase)`. Активность = `status==='active' && current_period_end > now`. Единственная точка логики «активна ли подписка».

### Фаза 1 — Stripe
- [ ] `src/app/api/stripe/checkout/route.ts` — POST, создаёт Checkout Session, redirect на Stripe.
- [ ] `src/app/api/stripe/webhook/route.ts` — POST, слушает `checkout.session.completed`, `customer.subscription.updated/deleted`. Проверять подпись (`stripe.webhooks.constructEvent`), читать **сырое тело** (`await req.text()`, не `req.json()` — Next.js 16), писать через **service-role** клиент (сессии юзера нет).
- [ ] Единственное место, где пишется `subscriptions` — этот вебхук.
- [ ] Страница тарифов (`/app/pro` или секция в `/profile`) + кнопка на checkout. До платежей тестить ручным переключением `status` в БД.

### Фаза 2 — лимит игр (самая заметная монетизация, минимум кода)
- [ ] Таблица `daily_game_plays` (`user_id`, `play_date` date, `count` int, PK `(user_id, play_date)`). **НЕ** in-memory `rate-limit.ts` (сбрасывается на cold start) и **НЕ** счёт из `scores` (туда пишется только завершённая игра → обход через abandon).
- [ ] RPC `try_consume_game_play(p_max int)` (security definer, атомарный upsert `count = count+1 where count < p_max`, returning `allowed`, `remaining`).
- [ ] В 4 generate-роутах (`api/games/lyric-song|name-song|higher-lower/generate`, `api/quiz/generate`) после `getUser()`: если `!isPro` → consume; при отказе вернуть `402` + `{ upgrade: true }`.
- [ ] `<Paywall />` модалка (`@base-ui/react` + framer-motion), триггер на `402` в компонентах игр.
- [ ] Индикатор «N/5 игр сегодня» в `games-grid.tsx`.
- [ ] РЕШИТЬ: общий пул на все игры (проще, сильнее толкает к подписке) или лимит по каждой игре.

### Фаза 3 — Wrapped + расширенная статистика
- [ ] `src/app/api/wrapped/route.tsx`: free — watermark и/или раз в месяц (колонка `last_wrapped_at`); pro — всегда и без watermark. (Watermark = виральный канал.)
- [ ] `src/app/app/stats/page.tsx`: передавать `isPro` в `StatsView`; залоченные карточки (история за всё время, сравнение периодов, экспорт) — блюр + замок.

### Фаза 4 — косметика профиля
- [ ] Premium-поля (рамки, темы, анимированные бейджи) поверх существующего `profile-media` / `edit-profile.tsx`; проверка `isPro` в `src/app/profile/actions.ts` перед сохранением.

### Идеи на потом (не freemium)
- [ ] Season Pass / игровая валюта поверх готовых лидербордов + streak (`src/lib/stats.ts`).
- [ ] Affiliate концертов/мерча (Bandsintown / Songkick / Ticketmaster) на страницах артистов — легально, не Spotify-данные.
- [ ] B2B artist insights (агрегаты `play_history` по странам — есть Listening Map). Требует масштаба + юр. проверки Spotify ToS.
