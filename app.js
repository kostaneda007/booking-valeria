const cfg = window.APP_CONFIG || {};
const sb = (cfg.SUPABASE_URL && !cfg.SUPABASE_URL.includes('YOUR_PROJECT_ID'))
  ? window.supabase.createClient(cfg.SUPABASE_URL, cfg.SUPABASE_ANON_KEY)
  : null;

const toastEl = document.querySelector('#toast');
const toast = (msg) => {
  toastEl.textContent = msg;
  toastEl.style.display = 'block';
  setTimeout(() => { toastEl.style.display = 'none'; }, 3500);
};
const esc = (s = '') => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

let currentUser = null;
let currentProfile = null;
let chosenService = null;
let chosenTime = null;
let chosenGuestService = null;
let chosenGuestTime = null;
let services = [];
let clients = [];

async function init() {
  if (!sb) {
    document.querySelector('#view-login').classList.remove('hidden');
    toast('Заполните config.js данными вашего проекта Supabase');
    return;
  }

  const { data: { session } } = await sb.auth.getSession();
  if (!session) {
    showGuestView();
    loadGuestServices();
    return;
  }

  currentUser = session.user;
  const { data: profile, error } = await sb
    .from('profiles')
    .select('*')
    .eq('id', currentUser.id)
    .single();

  if (error || !profile) {
    showView('login');
    return;
  }
  if (profile.status === 'blocked') {
    await sb.auth.signOut();
    toast('Ваш профиль заблокирован');
    showView('login');
    return;
  }

  currentProfile = profile;
  const adminBtn = document.getElementById('adminPanelBtn');
  if (adminBtn) {
    adminBtn.textContent = 'Выйти из админки';
    adminBtn.onclick = logout;
  }

  if (profile.role === 'admin' || profile.role === 'master') {
    document.querySelector('#masterGreeting').textContent = `Добрый день, ${profile.name || 'Валерия'}`;
    showView('master');
    initTabs('view-master');
    const today = new Date().toISOString().slice(0, 10);
    for (const id of ['wdate', 'bdate', 'calendarDate']) {
      const el = document.querySelector('#' + id);
      if (el) el.value = today;
    }
    loadTab('dashboard');
  } else {
    showView('client');
    initTabs('view-client');
    const today = new Date().toISOString().slice(0, 10);
    document.querySelector('#bookDate').value = today;
    loadTab('book');
  }
}

function showView(name) {
  for (const id of ['view-login', 'view-client', 'view-master', 'view-guest']) {
    document.querySelector('#' + id).classList.add('hidden');
  }
  document.querySelector('#view-' + name).classList.remove('hidden');
}

function showGuestView() {
  showView('guest');
}

function showLoginView() {
  showView('login');
}

/* Admin login – real Supabase Auth session */
async function adminLogin() {
  const login = document.getElementById('loginField').value.trim();
  const password = document.getElementById('passwordField').value.trim();
  if (!login || !password) return toast('Введите логин и пароль');

  const email = login.includes('@') ? login : `${login.toLowerCase()}@booking.local`;
  const { error } = await sb.auth.signInWithPassword({ email, password });
  if (error) return toast('Неверный логин или пароль: ' + error.message);

  location.reload();
}

function initTabs(containerId) {
  const root = document.querySelector('#' + containerId);
  root.querySelectorAll('nav button').forEach((btn) => {
    btn.onclick = () => {
      root.querySelectorAll('nav button').forEach((b) => b.classList.remove('active'));
      root.querySelectorAll('.tab').forEach((t) => t.classList.add('hidden'));
      btn.classList.add('active');
      document.querySelector('#' + btn.dataset.tab).classList.remove('hidden');
      loadTab(btn.dataset.tab);
    };
  });
}

function loadTab(tab) {
  if (currentProfile?.role === 'client') {
    if (tab === 'book') loadServices();
    if (tab === 'appointments' || tab === 'history') loadMy();
    if (tab === 'profile') loadProfile();
    if (tab === 'notifications') loadNotifications('notificationsList');
  } else {
    if (tab === 'dashboard') loadDashboard();
    if (tab === 'calendar') loadCalendar();
    if (tab === 'windows') loadWindows();
    if (tab === 'bookings') loadAdminBookings();
    if (tab === 'clients') loadClients();
    if (tab === 'm-notifications') loadNotifications('masterNotificationsList');
    if (tab === 'guest-requests') loadGuestRequests();
  }
}

// --- Авторизация через Supabase Email OTP ---
async function requestCode() {
  if (!sb) return toast('Сначала настройте config.js');
  const email = document.querySelector('#email').value.trim().toLowerCase();
  if (!email) return toast('Введите корректный email');
  const { error } = await sb.auth.signInWithOtp({ email });
  if (error) return toast(error.message);
  document.querySelector('#auth').innerHTML = `
    <label>Код из письма<input id="code" inputmode="numeric" maxlength="6" placeholder="000000"></label>
    <button onclick="verifyCode('${esc(email)}')">Войти</button>
  `;
  toast('Код отправлен на почту');
}

async function verifyCode(email) {
  const token = document.querySelector('#code').value.trim();
  const { error } = await sb.auth.verifyOtp({ email, token, type: 'email' });
  if (error) return toast(error.message);
  location.reload();
}

async function logout() {
  if (sb) await sb.auth.signOut();
  location.reload();
}

// --- Форматирование ---
function statusLabel(s) {
  return ({ active: 'Активна', completed: 'Завершена', cancelled: 'Отменена', no_show: 'Не состоялась' })[s] || s;
}

function fmtBooking(b, admin = false) {
  const clientName = b.profiles?.name || b.name || 'Клиент';
  const clientPhone = b.profiles?.phone || b.phone || '';
  const clientEmail = b.profiles?.email || b.email || '';
  return `<div class="card">
    <h3>${esc(b.service_name)}</h3>
    <b>${new Date(b.date + 'T00:00').toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', weekday: 'long' })}</b><br>
    ${b.start_time.slice(0, 5)}–${b.end_time.slice(0, 5)}
    <span class="muted">· ${b.duration_min} мин · ${statusLabel(b.status)}</span>
    ${admin ? `<br><b>${esc(clientName)}</b> · ${esc(clientPhone)}<br><small>${esc(clientEmail)}</small>` : ''}
    ${b.status === 'active' && !admin ? `<br><button onclick="cancelBooking(${b.id})">Отменить запись</button>` : ''}
    ${admin && b.status === 'active' ? `<br><button onclick="adminStatus(${b.id},'cancelled')">Отменить</button><button onclick="adminStatus(${b.id},'no_show')">Не пришел</button>` : ''}
  </div>`;
}

// --- Клиент ---
async function loadServices() {
  const { data, error } = await sb.from('services').select('*').eq('is_active', true).order('sort_order');
  if (error) return toast(error.message);
  services = data || [];
  document.querySelector('#services').innerHTML = services
    .map((s) => `<div class="service" onclick="chooseService(this,${s.id})"><b>${esc(s.name)}</b><br><small>${s.duration_min} минут</small></div>`)
    .join('');
}

function chooseService(el, id) {
  document.querySelectorAll('.service').forEach((x) => x.classList.remove('active'));
  el.classList.add('active');
  chosenService = id;
  chosenTime = null;
  document.querySelector('#createBooking').disabled = true;
  loadSlots();
}

async function loadSlots() {
  const date = document.querySelector('#bookDate').value;
  if (!date || !chosenService) return;
  const { data, error } = await sb.rpc('get_available_slots', { p_date: date, p_service_id: chosenService });
  if (error) return toast(error.message);
  const slots = (data || []).map((x) => x.slot_time);
  document.querySelector('#slots').innerHTML = slots.length
    ? slots.map((x) => `<button onclick="chooseTime(this,'${x}')">${x}</button>`).join('')
    : '<span class="muted">На эту дату нет свободного времени.</span>';
}

function chooseTime(el, t) {
  document.querySelectorAll('.slots button').forEach((x) => x.classList.remove('selected'));
  el.classList.add('selected');
  chosenTime = t;
  document.querySelector('#createBooking').disabled = false;
}

async function createBooking() {
  const date = document.querySelector('#bookDate').value;
  const { error } = await sb.rpc('create_booking', {
    p_service_id: chosenService,
    p_date: date,
    p_start_time: chosenTime,
    p_comment: '',
  });
  if (error) return toast(error.message);
  toast('Запись создана');
  document.querySelector('#createBooking').disabled = true;
  loadSlots();
}

async function loadMy() {
  const { data, error } = await sb
    .from('bookings')
    .select('*')
    .eq('client_id', currentUser.id)
    .order('date', { ascending: true })
    .order('start_time', { ascending: true });
  if (error) return toast(error.message);
  const now = new Date();
  const list = data || [];
  document.querySelector('#myBookings').innerHTML =
    list.filter((b) => b.status === 'active' && new Date(b.date + 'T' + b.start_time) > now).map((b) => fmtBooking(b, false)).join('') ||
    '<p class="muted">Предстоящих записей нет.</p>';
  document.querySelector('#historyBookings').innerHTML =
    list.filter((b) => b.status !== 'active' || new Date(b.date + 'T' + b.start_time) <= now).map((b) => fmtBooking(b, false)).join('') ||
    '<p class="muted">История пока пуста.</p>';
}

async function cancelBooking(id) {
  if (!confirm('Отменить запись?')) return;
  const { error } = await sb.rpc('cancel_my_booking', { p_booking_id: id });
  if (error) return toast(error.message);
  toast('Запись отменена');
  loadMy();
}

async function loadProfile() {
  document.querySelector('#pemail').value = currentProfile.email || '';
  document.querySelector('#pname').value = currentProfile.name || '';
  document.querySelector('#pphone').value = currentProfile.phone || '';
  document.querySelector('#pbirthday').value = currentProfile.birthday || '';
  document.querySelector('#pcomment').value = currentProfile.comment || '';
}

async function saveProfile() {
  const name = document.querySelector('#pname').value.trim();
  const phone = document.querySelector('#pphone').value.trim();
  if (!name || !phone) return toast('Имя и телефон обязательны');
  const { error } = await sb
    .from('profiles')
    .update({
      name,
      phone,
      birthday: document.querySelector('#pbirthday').value || null,
      comment: document.querySelector('#pcomment').value.trim(),
    })
    .eq('id', currentUser.id);
  if (error) return toast(error.message);
  currentProfile.name = name;
  currentProfile.phone = phone;
  toast('Профиль сохранен');
}

async function loadNotifications(targetId) {
  const { data, error } = await sb
    .from('notifications')
    .select('*')
    .eq('user_id', currentUser.id)
    .order('created_at', { ascending: false });
  if (error) return toast(error.message);
  const el = document.querySelector('#' + targetId);
  el.innerHTML = (data || [])
    .map((n) => `<div class="card"><b>${esc(n.title)}</b><br><small class="muted">${new Date(n.created_at).toLocaleString('ru-RU')}</small><p style="white-space:pre-line">${esc(n.text)}</p></div>`)
    .join('') || '<p class="muted">Уведомлений пока нет.</p>';
  await sb.from('notifications').update({ is_read: true }).eq('user_id', currentUser.id).eq('is_read', false);
}

// --- Мастер ---
async function loadDashboard() {
  const today = new Date().toISOString().slice(0, 10);
  const { count: todayCount } = await sb
    .from('bookings')
    .select('*', { count: 'exact', head: true })
    .eq('date', today)
    .eq('status', 'active');

  const { data: nextList } = await sb
    .from('bookings')
    .select('*, profiles(name)')
    .eq('status', 'active')
    .gte('date', today)
    .order('date', { ascending: true })
    .order('start_time', { ascending: true })
    .limit(1);

  const { count: unreadCount } = await sb
    .from('notifications')
    .select('*', { count: 'exact', head: true })
    .eq('user_id', currentUser.id)
    .eq('is_read', false);

  const next = nextList && nextList[0];
  document.querySelector('#stats').innerHTML = `
    <div><b>${todayCount || 0}</b>записей сегодня</div>
    <div><b>${next ? next.start_time.slice(0, 5) : '—'}</b>${next ? esc(next.profiles?.name || 'Клиент') : 'ближайшей записи нет'}</div>
    <div><b>${unreadCount || 0}</b>новых уведомлений</div>
  `;
}

async function loadCalendar() {
  const date = document.querySelector('#calendarDate').value;
  const { data, error } = await sb
    .from('bookings')
    .select('*, profiles(name, phone, email)')
    .eq('date', date)
    .order('start_time');
  if (error) return toast(error.message);
  document.querySelector('#calendarList').innerHTML = (data || []).map((b) => fmtBooking(b, true)).join('') || '<p class="muted">На эту дату записей нет.</p>';
}

async function addWindow() {
  const date = document.querySelector('#wdate').value;
  const start_time = document.querySelector('#wstart').value;
  const end_time = document.querySelector('#wend').value;
  const comment = document.querySelector('#wcomment').value.trim();
  if (!date || !start_time || !end_time || start_time >= end_time) {
    return toast('Проверьте дату и время (окончание должно быть позже начала)');
  }
  const { error } = await sb.from('work_windows').insert({ date, start_time, end_time, comment });
  if (error) return toast(error.message);
  toast('Рабочее окно добавлено');
  loadWindows();
}

async function loadWindows() {
  const { data, error } = await sb.from('work_windows').select('*').order('date').order('start_time');
  if (error) return toast(error.message);
  document.querySelector('#windowsList').innerHTML = (data || [])
    .map((w) => `<div class="card"><b>${w.date}</b> · ${w.start_time.slice(0, 5)}–${w.end_time.slice(0, 5)}<br><span class="muted">${esc(w.comment || '')}</span><br><button onclick="deleteWindow(${w.id})">Удалить</button></div>`)
    .join('') || '<p class="muted">Добавьте первое рабочее окно.</p>';
}

async function deleteWindow(id) {
  const { error } = await sb.from('work_windows').delete().eq('id', id);
  if (error) return toast(error.message);
  loadWindows();
}

async function adminData() {
  const [{ data: cData }, { data: sData }] = await Promise.all([
    sb.from('profiles').select('*').eq('role', 'client').order('name'),
    sb.from('services').select('*').eq('is_active', true).order('sort_order'),
  ]);
  clients = cData || [];
  services = sData || [];
  document.querySelector('#bclient').innerHTML = clients
    .map((c) => `<option value="${c.id}">${esc(c.name || c.email)} — ${esc(c.phone || '')}</option>`)
    .join('');
  document.querySelector('#bservice').innerHTML = services
    .map((s) => `<option value="${s.id}">${esc(s.name)}</option>`)
    .join('');
}

async function loadAdminBookings() {
  await adminData();
  const q = document.querySelector('#bookingSearch').value.trim().toLowerCase();
  const { data, error } = await sb
    .from('bookings')
    .select('*, profiles(name, phone, email)')
    .order('date', { ascending: false })
    .order('start_time', { ascending: false });
  if (error) return toast(error.message);
  const filtered = (data || []).filter((b) => {
    if (!q) return true;
    const p = b.profiles || {};
    return (p.name || '').toLowerCase().includes(q) || (p.phone || '').toLowerCase().includes(q) || (p.email || '').toLowerCase().includes(q);
  });
  document.querySelector('#adminBookings').innerHTML = filtered.map((b) => fmtBooking(b, true)).join('') || '<p class="muted">Записей нет.</p>';
}

async function addAdminBooking() {
  const client_id = document.querySelector('#bclient').value;
  const service_id = Number(document.querySelector('#bservice').value);
  const date = document.querySelector('#bdate').value;
  const start_time = document.querySelector('#btime').value;
  const comment = document.querySelector('#bcomment').value.trim();
  const svc = services.find((s) => s.id === service_id);
  if (!client_id || !svc || !date || !start_time) return toast('Заполните все поля');

  const [hh, mm] = start_time.split(':').map(Number);
  const endDate = new Date(2000, 0, 1, hh, mm + svc.duration_min);
  const end_time = `${String(endDate.getHours()).padStart(2, '0')}:${String(endDate.getMinutes()).padStart(2, '0')}:00`;

  const { error } = await sb.from('bookings').insert({
    client_id,
    date,
    start_time: start_time + ':00',
    end_time,
    service_id: svc.id,
    service_name: svc.name,
    duration_min: svc.duration_min,
    comment,
  });
  if (error) return toast(error.message);
  toast('Запись создана');
  loadAdminBookings();
}

async function adminStatus(id, status) {
  const patch = { status, updated_at: new Date().toISOString() };
  if (status === 'cancelled') patch.cancelled_at = new Date().toISOString();
  const { error } = await sb.from('bookings').update(patch).eq('id', id);
  if (error) return toast(error.message);
  toast('Статус обновлен');
  loadAdminBookings();
}

async function loadClients() {
  const { data, error } = await sb.from('profiles').select('*').eq('role', 'client').order('name');
  if (error) return toast(error.message);
  document.querySelector('#clientsList').innerHTML = (data || [])
    .map((c) => `<div class="card"><b>${esc(c.name || 'Без имени')}</b> · ${esc(c.phone || '—')}<br><small>${esc(c.email || '')}</small><br><span class="muted">Статус: ${c.status}</span><br><button onclick="toggleBlock('${c.id}','${c.status}')">${c.status === 'active' ? 'Заблокировать' : 'Разблокировать'}</button></div>`)
    .join('') || '<p class="muted">Клиентов пока нет.</p>';
}

async function toggleBlock(id, currentStatus) {
  const next = currentStatus === 'active' ? 'blocked' : 'active';
  const { error } = await sb.from('profiles').update({ status: next }).eq('id', id);
  if (error) return toast(error.message);
  loadClients();
}




function setTodayDate() {
  const today = new Date();
  const y = today.getFullYear();
  const m = String(today.getMonth() + 1).padStart(2, '0');
  const d = String(today.getDate()).padStart(2, '0');
  const el = document.getElementById('guestDate');
  if (el) {
    el.type = 'date';
    el.min = '2023-01-01';
    el.max = '2024-12-31';
    el.value = `${y}-${m}-${d}`;
  }
}

// --- Гостевой бронирование без регистрации ---
function setTodayDate() {
  const today = new Date();
  const y = today.getFullYear();
  const m = String(today.getMonth() + 1).padStart(2, '0');
  const d = String(today.getDate()).padStart(2, '0');
  const el = document.getElementById('guestDate');
  if (el) {
    el.type = 'date';
    el.min = '2023-01-01';
    el.max = '2024-12-31';
    el.value = `${y}-${m}-${d}`;
  }
}

async function loadGuestServices() {
  const { data, error } = await sb
    .from('services')
    .select('*')
    .eq('is_active', true)
    .order('sort_order');
  if (error) return toast(error.message);
  const services = data || [];
  const select = document.getElementById('guestServices');
  select.innerHTML = services
    .map(s => `<option value="${s.id}">${esc(s.name)}</option>`)
    .join('');
  setTodayDate();
  if (services.length === 0) {
    select.innerHTML = '<option value="">Услуги не настроены</option>';
    document.getElementById('guestSlots').innerHTML = '<span class="muted">Нет доступных услуг.</span>';
    return;
  }
  // default to first service
  const firstService = services[0];
  chooseGuestService(firstService.id);
}

function chooseGuestService(id) {
  const select = document.getElementById('guestServices');
  if (!select) return;
  select.value = id;
  chosenGuestService = id;
  chosenGuestTime = null;
  document.getElementById('guestCreateBtn').disabled = true;
  document.getElementById('guestCalendar').classList.remove('hidden');
  document.getElementById('guestContactForm').classList.add('hidden');
  loadGuestSlots();
}

async function loadGuestSlots() {
  const date = document.getElementById('guestDate').value;
  if (!date || !chosenGuestService) return;
  const { data, error } = await sb.rpc('get_available_slots', { p_date: date, p_service_id: chosenGuestService });
  if (error) return toast(error.message);
  const slots = (data || []).map(x => x.slot_time);
  const container = document.getElementById('guestSlots');
  container.innerHTML = slots.length
    ? slots.map(x => `<button onclick="chooseGuestTime('${x}')">${x}</button>`).join('')
    : '<span class="muted">На эту дату нет свободного времени.</span>';
}

function chooseGuestTime(time) {
  document.querySelectorAll('#guestSlots button').forEach(btn => btn.classList.remove('selected'));
  event.target.classList.add('selected');
  chosenGuestTime = time;
  document.getElementById('guestCreateBtn').disabled = false;
  // Hide calendar, show contact form
  document.getElementById('guestCalendar').classList.add('hidden');
  document.getElementById('guestContactForm').classList.remove('hidden');
}

async function createGuestBooking() {
  const name = document.getElementById('guestName').value.trim();
  const phone = document.getElementById('guestPhone').value.trim();
  const date = document.getElementById('guestDate').value;
  if (!name || !phone || !date || !chosenGuestService || !chosenGuestTime) {
    return toast('Заполните все поля');
  }
  const { data, error } = await sb.rpc('create_guest_booking', {
    p_name: name,
    p_phone: phone,
    p_date: date,
    p_service_id: chosenGuestService,
    p_start_time: chosenGuestTime,
    p_comment: ''
  });
  if (error) return toast(error.message);
  const confirmationCode = data && data.length ? data[0].confirmation_code : '';
  const result = document.getElementById('guestResult');
  result.innerHTML = `<p class="muted">Запись создана. Ваш код подтверждения: <strong>${confirmationCode}</strong>.</p>`;
  // Reset to calendar
  document.getElementById('guestCalendar').classList.remove('hidden');
  document.getElementById('guestContactForm').classList.add('hidden');
  document.getElementById('guestSlots').innerHTML = '';
  document.getElementById('guestName').value = '';
  document.getElementById('guestPhone').value = '';
  document.getElementById('guestDate').value = '';
  chosenGuestService = null;
  chosenGuestTime = null;
  document.getElementById('guestCreateBtn').disabled = true;
}

function showCalendar() {
  document.getElementById('guestContactForm').classList.add('hidden');
  document.getElementById('guestCalendar').classList.remove('hidden');
  setTodayDate();
  loadGuestSlots();
}

async function loadGuestSlots() {
  const date = document.getElementById('guestDate').value;
  if (!date || !chosenGuestService) return;
  const { data, error } = await sb.rpc('get_available_slots', { p_date: date, p_service_id: chosenGuestService });
  if (error) return toast(error.message);
  const slots = (data || []).map(x => x.slot_time);
  const container = document.getElementById('guestSlots');
  container.innerHTML = slots.length
    ? slots.map(x => `<button onclick="chooseGuestTime('${x}')">${x}</button>`).join('')
    : '<span class="muted">На эту дату нет свободного времени.</span>';
}
init();