// Chitzy — demo app shell with optional Supabase auth
// Focus: offline-capable UI prototype, theme system, optional Supabase for auth

let supabase = null; // supabase client (if configured)
let supabaseReady = false;
// Firebase (optional)
let firebaseApp = null;
let firebaseAuth = null;
let firebaseReady = false;
let recaptchaVerifier = null;

const state = {
  user: null,
  settings: {
    // theme: 'system' | 'light' | 'dark'
    theme: 'system',
    lang: 'en',
    notifs: true,
    e2e: true,
  },
  chats: [],
  messages: {}, // chatId -> array of {id, chatId, senderId, time, text, read, reactions}
  activeChatId: null,
  contacts: [],
  chatFilter: 'all',
  // group creation temp state
  groupSelectMode: false,
  groupSelected: new Set(),
};

const els = {
  authView: document.getElementById('authView'),
  chatView: document.getElementById('chatView'),
  tabs: document.querySelectorAll('.auth-tabs .tab'),
  panels: document.querySelectorAll('.tab-panels .panel'),
  loginForm: document.getElementById('loginForm'),
  signupForm: document.getElementById('signupForm'),
  chatList: document.getElementById('chatList'),
  messageList: document.getElementById('messageList'),
  convTitle: document.getElementById('convTitle'),
  convPresence: document.getElementById('convPresence'),
  typing: document.getElementById('typingIndicator'),
  messageInput: document.getElementById('messageInput'),
  sendBtn: document.getElementById('sendBtn'),
  scheduleBanner: document.getElementById('scheduleBanner'),
  attachments: document.getElementById('attachments'),
  infoPanel: document.getElementById('infoPanel'),
  btnInfo: document.getElementById('btnInfo'),
  btnCloseInfo: document.getElementById('btnCloseInfo'),
  btnNewChat: document.getElementById('btnNewChat'),
  settingsModal: document.getElementById('settingsModal'),
  profileModal: document.getElementById('profileModal'),
  newChatModal: document.getElementById('newChatModal'),
  pollModal: document.getElementById('pollModal'),
  themeSelect: document.getElementById('themeSelect'),
  langSelect: document.getElementById('langSelect'),
  toggleNotifs: document.getElementById('toggleNotifs'),
  toggleE2E: document.getElementById('toggleE2E'),
  btnSettings: document.getElementById('btnSettings'),
  btnProfile: document.getElementById('btnProfile'),
  btnSchedule: document.getElementById('btnSchedule'),
  btnTranslate: document.getElementById('btnTranslate'),
  btnTTS: document.getElementById('btnTTS'),
  btnEmoji: document.getElementById('btnEmoji'),
  btnSticker: document.getElementById('btnSticker'),
  btnGif: document.getElementById('btnGif'),
  btnAttach: document.getElementById('btnAttach'),
  filePicker: document.getElementById('filePicker'),
  searchInput: document.getElementById('searchInput'),
  statusBar: document.getElementById('statusBar'),
  btnVoiceCall: document.getElementById('btnVoiceCall'),
  btnVideoCall: document.getElementById('btnVideoCall'),
  btnGoogle: document.getElementById('btnGoogle'),
  btnApple: document.getElementById('btnApple'),
  btnOtp: document.getElementById('btnOtp'),
  btnBiometric: document.getElementById('btnBiometric'),
  btnCreateGroup: document.getElementById('btnCreateGroup'),
  btnCreateChannel: document.getElementById('btnCreateChannel'),
  tplChatItem: document.getElementById('tpl-chat-item'),
  tplMessage: document.getElementById('tpl-message'),
  btnAbout: document.getElementById('btnAbout'),
  btnLogout: document.getElementById('btnLogout'),
  aboutModal: document.getElementById('aboutModal'),
  aboutInfo: document.getElementById('aboutInfo'),
  btnGoogleSignup: document.getElementById('btnGoogleSignup'),
  btnAppleSignup: document.getElementById('btnAppleSignup'),
  btnTerms: document.getElementById('btnTerms'),
  termsModal: document.getElementById('termsModal'),
  btnPermissions: document.getElementById('btnPermissions'),
  btnEnrollBiometric: document.getElementById('btnEnrollBiometric'),
  viewerModal: document.getElementById('viewerModal'),
  viewerBody: document.getElementById('viewerBody'),
  viewerTitle: document.getElementById('viewerTitle'),
  viewerDownload: document.getElementById('viewerDownload')
};

// Local storage helpers
const storage = {
  save(key, val){
    localStorage.setItem(`chitzy:${key}`, JSON.stringify(val));
  },
  load(key, fallback){
    try{ return JSON.parse(localStorage.getItem(`chitzy:${key}`)) ?? fallback; }catch{ return fallback; }
  }
};

// Mock crypto (for demo only)
const cryptoDemo = {
  encrypt(text){
    if(!state.settings.e2e) return text;
    return btoa(unescape(encodeURIComponent(text)));
  },
  decrypt(text){
    if(!state.settings.e2e) return text;
    try{ return decodeURIComponent(escape(atob(text))); }catch{ return text; }
  }
};

// System theme monitoring
let mqlDark;

// Initialization
(function init(){
  // restore
  const savedSettings = storage.load('settings', state.settings);
  // migrate from legacy dark boolean if present
  if(savedSettings.dark !== undefined && savedSettings.theme === undefined){
    savedSettings.theme = savedSettings.dark ? 'dark' : 'light';
    delete savedSettings.dark;
  }
  Object.assign(state.settings, savedSettings);
  state.user = storage.load('user', null);
  state.chats = storage.load('chats', demoSeedChats());
  state.messages = storage.load('messages', demoSeedMessages(state.chats));
  state.contacts = storage.load('contacts', demoSeedContacts());

  // apply settings
  applyTheme(state.settings.theme);
  if(els.themeSelect){ els.themeSelect.value = state.settings.theme || 'system'; }
  if(els.langSelect){ els.langSelect.value = state.settings.lang || 'en'; }
  if(els.toggleNotifs){ els.toggleNotifs.checked = !!state.settings.notifs; }
  if(els.toggleE2E){ els.toggleE2E.checked = !!state.settings.e2e; }

  // wire auth tabs
  els.tabs.forEach(tab => { tab.addEventListener('click', () => switchTab(tab.dataset.tab)); });

  els.loginForm.addEventListener('submit', onLogin);
  els.signupForm.addEventListener('submit', onSignup);

  // settings toggles
  if(els.themeSelect){
    els.themeSelect.addEventListener('change', (e)=>{ state.settings.theme = e.target.value; storage.save('settings', state.settings); applyTheme(state.settings.theme); });
  }
  if(els.langSelect){ els.langSelect.addEventListener('change', (e)=>{ state.settings.lang = e.target.value; storage.save('settings', state.settings); }); }
  if(els.toggleNotifs){ els.toggleNotifs.addEventListener('change', (e)=>{ state.settings.notifs = e.target.checked; storage.save('settings', state.settings); }); }
  if(els.toggleE2E){ els.toggleE2E.addEventListener('change', (e)=>{ state.settings.e2e = e.target.checked; storage.save('settings', state.settings); }); }

  // navigation and modals
  els.btnSettings.addEventListener('click', () => els.settingsModal.showModal());
  els.btnProfile.addEventListener('click', () => {
    document.getElementById('profileName').value = state.user?.name || '';
    document.getElementById('profileBio').value = state.user?.bio || '';
    els.profileModal.showModal();
  });
  els.btnNewChat.addEventListener('click', () => {
    // reset group selection state each time modal opens
    state.groupSelectMode = false; state.groupSelected = new Set();
    injectSyncContactsButton();
    const cs = document.getElementById('contactSearch');
    if(cs && !cs._wired){ cs.addEventListener('input', renderContacts); cs._wired = true; }
    renderContacts();
    updateGroupCreateButton();
    els.newChatModal.showModal();
  });
  els.newChatModal.addEventListener('close', () => { state.groupSelectMode = false; state.groupSelected = new Set(); });
  if(els.btnCreateGroup){ els.btnCreateGroup.addEventListener('click', onCreateGroupClick); }
  if(els.btnCreateChannel){ els.btnCreateChannel.addEventListener('click', ()=> alert('Channels are coming soon.')); }
  document.getElementById('saveProfile').addEventListener('click', saveProfile);
  if(els.btnAbout){ els.btnAbout.addEventListener('click', showAbout); }
  if(els.btnLogout){ els.btnLogout.addEventListener('click', logout); }
  if(els.btnTerms){ els.btnTerms.addEventListener('click', ()=> els.termsModal?.showModal()); }
  if(els.btnPermissions){ els.btnPermissions.addEventListener('click', requestPermissions); }
  if(els.btnEnrollBiometric){ els.btnEnrollBiometric.addEventListener('click', enrollBiometric); }
  if(els.btnAbout){ els.btnAbout.addEventListener('click', showAbout); }
  if(els.btnLogout){ els.btnLogout.addEventListener('click', logout); }
  // Provider buttons (prefer Firebase if configured, else Supabase)
  if(els.btnGoogle){ els.btnGoogle.addEventListener('click', handleGoogle); }
  if(els.btnApple){ els.btnApple.addEventListener('click', handleApple); }
  if(els.btnOtp){ els.btnOtp.addEventListener('click', handlePhoneOtp); }
  if(els.btnGoogleSignup){ els.btnGoogleSignup.addEventListener('click', handleGoogle); }
  if(els.btnAppleSignup){ els.btnAppleSignup.addEventListener('click', handleApple); }

  // composer
  els.sendBtn.addEventListener('click', sendMessage);
  els.messageInput.addEventListener('keydown', (e)=>{ if(e.key==='Enter' && !e.shiftKey){ e.preventDefault(); sendMessage(); } });
  els.btnAttach.addEventListener('click', openAttachMenu);
  els.filePicker.addEventListener('change', handlePickedFiles);
  els.btnSchedule.addEventListener('click', scheduleMessagePrompt);
  els.btnTranslate.addEventListener('click', translateLastMessage);
  els.btnTTS.addEventListener('click', speakLastMessage);
  els.btnEmoji.addEventListener('click', ()=> insertAtCursor('😊'));
  els.btnSticker.addEventListener('click', ()=> insertAtCursor('🎟️'));
  els.btnGif.addEventListener('click', ()=> insertAtCursor('GIF '));

  // info panel
  els.btnInfo.addEventListener('click', openInfoPanel);
  els.btnCloseInfo.addEventListener('click', ()=> toggleInfoPanel(false));

  // calls (mock)
  els.btnVoiceCall.addEventListener('click', ()=> alert('Voice call (demo)'));
  els.btnVideoCall.addEventListener('click', ()=> alert('Video call (demo)'));

  // search & filters
  els.searchInput.addEventListener('input', renderChatList);
  document.querySelectorAll('.filters .chip').forEach(chip=>{
    chip.addEventListener('click', ()=>{
      document.querySelectorAll('.filters .chip').forEach(c=>c.classList.remove('active'));
      chip.classList.add('active');
      state.chatFilter = chip.dataset.filter || 'all';
      renderChatList();
    });
  });

  // try to setup Firebase (optional) then Supabase (optional)
  setupFirebase().finally(()=>{
    setupSupabase().finally(()=>{
      if(state.user){ showChatView(); } else { showAuthView(); }
    });
  });

  setTimeout(renderStories, 100);
  // hide loader after init frame
  requestAnimationFrame(()=>{
    document.body.classList.remove('is-loading');
  });
})();

function applyTheme(theme){
  state.settings.theme = theme || 'system';
  const isDark = state.settings.theme === 'dark' || (state.settings.theme === 'system' && prefersDark());
  document.documentElement.classList.toggle('dark', isDark);
  updateMetaThemeColor(isDark);
  storage.save('settings', state.settings);
  if(mqlDark){ mqlDark.removeEventListener('change', onSystemThemeChange); }
  if(state.settings.theme === 'system'){
    mqlDark = window.matchMedia('(prefers-color-scheme: dark)');
    mqlDark.addEventListener('change', onSystemThemeChange);
  }
}
function onSystemThemeChange(){ applyTheme('system'); }
function prefersDark(){ return window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches; }
function updateMetaThemeColor(isDark){ const meta = document.querySelector('meta[name="theme-color"]'); if(!meta) return; meta.setAttribute('content', isDark ? '#101317' : '#ffffff'); }

async function logout(){
  try{ if(firebaseReady){ const { signOut } = await import('https://www.gstatic.com/firebasejs/10.12.5/firebase-auth.js'); await signOut(firebaseAuth); } }catch{}
  try{ if(supabaseReady){ await supabase.auth.signOut(); } }catch{}
  state.user = null; storage.save('user', null);
  showAuthView();
}

function showAbout(){
  if(!els.aboutModal) return;
  const info = els.aboutInfo; if(info){
    info.innerHTML = '';
    const add = (k,v)=>{ const row=document.createElement('div'); row.className='row between'; row.innerHTML = `<div>${k}</div><div class=\"muted\">${v}</div>`; info.appendChild(row); };
    add('Version','0.1.0');
    add('Theme', state.settings.theme);
    add('Supabase', supabaseReady ? 'connected' : 'not connected');
    add('User', state.user ? state.user.id : 'Guest');
    add('Project', window.CHITZY_SUPABASE_URL || '—');
  }
  els.aboutModal.showModal();
}

function switchTab(name){ els.tabs.forEach(t=>t.classList.toggle('active', t.dataset.tab===name)); els.panels.forEach(p=>p.classList.toggle('active', p.dataset.panel===name)); }

async function onLogin(e){
  e.preventDefault();
  const id = document.getElementById('loginId').value.trim();
  const pwd = document.getElementById('loginPassword').value;
  if(!id || !pwd){ alert('Enter credentials'); return; }
  if(supabaseReady){
    try{
      let res;
      if(id.includes('@')) res = await supabase.auth.signInWithPassword({ email: id, password: pwd });
      else res = await supabase.auth.signInWithPassword({ phone: id, password: pwd });
      if(res.error) throw res.error;
      const { data: { user } } = await supabase.auth.getUser();
      state.user = mapSbUser(user); storage.save('user', state.user); showChatView(); return;
    } catch(err){ alert('Login failed: '+ err.message); return; }
  }
  state.user = { id: 'u-'+hash(id), name: id.split('@')[0]||id, avatar: '', bio:'' }; storage.save('user', state.user); showChatView();
}

async function onSignup(e){
  e.preventDefault();
  const name = document.getElementById('signupName').value.trim();
  const email = document.getElementById('signupEmail').value.trim();
  const phone = document.getElementById('signupPhone').value.trim();
  const pwd = document.getElementById('signupPassword').value;
  if(!name || !email || !pwd){ alert('Fill required fields'); return; }
  if(supabaseReady){
    try{
      const res = await supabase.auth.signUp({ email, password: pwd, options: { data: { name, phone } } });
      if(res.error) throw res.error; alert('Check your email to confirm your account.'); switchTab('login'); return;
    }catch(err){ alert('Sign up failed: '+ err.message); return; }
  }
  state.user = { id: 'u-'+hash(email||phone), name, avatar:'', bio:'' }; storage.save('user', state.user); showChatView();
}

function showAuthView(){ els.authView.setAttribute('aria-hidden','false'); els.chatView.setAttribute('aria-hidden','true'); smoothScrollTop(); }
function showChatView(){ els.authView.setAttribute('aria-hidden','true'); els.chatView.setAttribute('aria-hidden','false'); renderChatList(); renderConversation(state.activeChatId ?? state.chats[0]?.id); smoothScrollTop(); }

function renderStories(){ els.statusBar.innerHTML = ''; const you = document.createElement('div'); you.className = 'story'; you.title = 'Your status'; els.statusBar.appendChild(you); for(let i=0;i<8;i++){ const el = document.createElement('div'); el.className = 'story'; el.title = 'Story'; els.statusBar.appendChild(el);} }

function chatMatchesFilter(chat){
  const f = state.chatFilter || 'all';
  if(f==='all') return true;
  if(f==='groups') return chat.type==='group';
  if(f==='channels') return chat.type==='channel';
  if(f==='unread'){ const msgs = state.messages[chat.id]||[]; return msgs.some(m=>!m.read && m.senderId !== state.user?.id); }
  if(f==='starred'){ const msgs = state.messages[chat.id]||[]; return msgs.some(m=>m.star); }
  return true;
}

function renderChatList(){
  const q = (els.searchInput.value||'').toLowerCase();
  els.chatList.innerHTML = '';
  const frag = document.createDocumentFragment();
  state.chats
    .filter(c=>(!q || c.name.toLowerCase().includes(q)) && chatMatchesFilter(c))
    .sort((a,b)=> ((b.pinned?1:0)-(a.pinned?1:0)) || ((b.lastTime||0)-(a.lastTime||0)))
    .forEach(chat => {
      const node = els.tplChatItem.content.cloneNode(true);
      const root = node.querySelector('.chat-item');
      root.addEventListener('click', ()=> renderConversation(chat.id));
      root.querySelector('.name').textContent = chat.name + (chat.pinned?' 📌':'');
      root.querySelector('.time').textContent = chat.lastTime ? timeAgo(chat.lastTime) : '';
      root.querySelector('.preview').textContent = chat.lastPreview || '';
      frag.appendChild(node);
    });
  els.chatList.appendChild(frag);
}

function renderConversation(chatId){
  if(!chatId){ els.convTitle.textContent = 'Select a chat'; els.messageList.innerHTML=''; return; }
  state.activeChatId = chatId;
  const chat = state.chats.find(c=>c.id===chatId);
  if(!chat) return;
  els.convTitle.textContent = chat.name;
  els.convPresence.textContent = chat.presence || (chat.type==='group' ? `${(chat.members||[]).length} members` : 'online');

  const msgs = state.messages[chatId] || [];
  els.messageList.innerHTML = '';
  for(const m of msgs){ els.messageList.appendChild(renderMessage(m)); }
  els.messageList.scrollTop = els.messageList.scrollHeight;
}

function renderMessage(m){
  const node = els.tplMessage.content.cloneNode(true);
  const root = node.querySelector('.msg');
  if(m.senderId === state.user?.id) root.classList.add('self');
  const bubble = node.querySelector('.bubble');
  const content = node.querySelector('.content');
  const status = node.querySelector('.status');
  const read = node.querySelector('.read');

  // Specialized rendering for attachments
  if(m.type === 'location' && m.payload){
    const { lat, lng } = m.payload;
    const a = document.createElement('a'); a.href = `https://maps.google.com/?q=${lat},${lng}`; a.target = '_blank'; a.rel='noopener'; a.textContent = `📍 ${lat.toFixed(5)}, ${lng.toFixed(5)}`; content.innerHTML=''; content.appendChild(a);
  } else if(m.type === 'contact' && m.payload){
    const { name, phone, email } = m.payload;
    const div = document.createElement('div');
    const title = document.createElement('div'); title.textContent = `👤 ${name || 'Contact'}`; const sub = document.createElement('div'); sub.style.color='var(--muted)'; sub.textContent = [phone,email].filter(Boolean).join(' · ');
    div.appendChild(title); div.appendChild(sub); content.innerHTML=''; content.appendChild(div);
  } else if((m.type === 'file' || m.type === 'image' || m.type === 'video') && m.payload){
    const { url, name, size, mime } = m.payload;
    if(m.type === 'image' && url){
      const img = document.createElement('img'); img.src = url; img.alt = name||'image'; img.style.maxWidth='260px'; img.style.borderRadius='12px'; img.style.display='block'; img.style.marginBottom='6px'; img.style.cursor='zoom-in'; img.addEventListener('click', ()=> openViewer(m.payload, 'image')); content.appendChild(img);
    }
    if(m.type === 'video' && url){
      const vid = document.createElement('video'); vid.src = url; vid.controls = true; vid.style.maxWidth='260px'; vid.style.borderRadius='12px'; vid.style.display='block'; vid.style.marginBottom='6px'; content.appendChild(vid);
    }
    // Actions row
    const actions = document.createElement('div'); actions.className='row'; actions.style.gap='12px';
    const openBtn = document.createElement('button'); openBtn.className='btn'; openBtn.type='button'; openBtn.textContent='Open'; openBtn.addEventListener('click', ()=> openViewer(m.payload, m.type)); actions.appendChild(openBtn);
    const saveA = document.createElement('a'); saveA.className='btn'; saveA.href = url; saveA.setAttribute('download', name||'file'); saveA.textContent='Save'; actions.appendChild(saveA);
    content.appendChild(actions);
    // Filename and size
    const meta = document.createElement('div'); meta.style.color='var(--muted)'; meta.style.fontSize='12px'; meta.textContent = `${name || (mime || 'file')}${size?` • ${Math.round(size/1024)} KB`:''}`; content.appendChild(meta);
  } else {
    const text = cryptoDemo.decrypt(m.text || '');
    content.textContent = text;
  }

  status.textContent = new Date(m.time).toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'});
  read.textContent = m.read ? '✓✓' : '✓';
  // right-click to delete this message
  bubble.title = 'Right-click to delete message';
  bubble.addEventListener('contextmenu', (e)=>{ e.preventDefault(); if(confirm('Delete this message?')) deleteMessage(m.chatId, m.id); });
  // double-click to star/unstar
  bubble.addEventListener('dblclick', ()=> toggleStar(m.chatId, m.id));
  // reactions / stars
  const reactions = node.querySelector('.reactions');
  const marks = (m.reactions && m.reactions.length) ? [...m.reactions] : [];
  if(m.star) marks.push('★');
  if(marks.length){ reactions.hidden = false; reactions.textContent = marks.join(' '); }
  return node;
}

function toggleStar(chatId, msgId){ const arr = state.messages[chatId]||[]; const m = arr.find(x=>x.id===msgId); if(!m) return; m.star = !m.star; storage.save('messages', state.messages); renderConversation(chatId); }

function deleteMessage(chatId, msgId){
  const arr = state.messages[chatId] || [];
  const idx = arr.findIndex(x=>x.id===msgId);
  if(idx!==-1){ arr.splice(idx,1); }
  const chat = state.chats.find(c=>c.id===chatId);
  // update chat preview/time
  const last = arr[arr.length-1];
  chat.lastTime = last ? last.time : 0;
  chat.lastPreview = last ? (last.type ? previewFor(last) : cryptoDemo.decrypt(last.text)) : '';
  storage.save('messages', state.messages);
  storage.save('chats', state.chats);
  renderConversation(chatId);
}

function sendMessage(){
  const chatId = state.activeChatId;
  if(!chatId) return;
  const input = els.messageInput;
  const text = input.value.trim();
  if(!text && !els.attachments.childElementCount) return;
  const msg = { id: 'm-'+Date.now(), chatId, senderId: state.user.id, time: Date.now(), text: cryptoDemo.encrypt(text || '[attachment]'), read: false, reactions: [] };
  state.messages[chatId] = state.messages[chatId] || [];
  state.messages[chatId].push(msg);
  const chat = state.chats.find(c=>c.id===chatId);
  chat.lastTime = msg.time; chat.lastPreview = text || '[attachment]';
  storage.save('messages', state.messages); storage.save('chats', state.chats);
  const node = renderMessage(msg); node.firstElementChild?.classList.add('new');
  els.messageList.appendChild(node); els.messageList.scrollTop = els.messageList.scrollHeight; input.value = ''; els.attachments.innerHTML = ''; els.attachments.hidden = true;
  showTyping(true);
  setTimeout(()=>{ showTyping(false); msg.read = true; storage.save('messages', state.messages); renderConversation(chatId); }, 800);
}

// Special messages (attachments/location/contact)
function sendSpecialMessage(chatId, type, payload, label){
  const msg = { id: 'm-'+Date.now()+Math.random().toString(36).slice(2), chatId, senderId: state.user?.id, time: Date.now(), text: cryptoDemo.encrypt(label||''), read: false, reactions: [], type, payload };
  state.messages[chatId] = state.messages[chatId] || [];
  state.messages[chatId].push(msg);
  const chat = state.chats.find(c=>c.id===chatId);
  chat.lastTime = msg.time; chat.lastPreview = previewFor(msg);
  storage.save('messages', state.messages); storage.save('chats', state.chats);
  els.messageList.appendChild(renderMessage(msg)); els.messageList.scrollTop = els.messageList.scrollHeight;
}

function previewFor(m){
  if(m.type==='location') return '📍 Location';
  if(m.type==='contact') return '👤 Contact';
  if(m.type==='image') return '🖼️ Photo';
  if(m.type==='video') return '🎬 Video';
  if(m.type==='file') return '📄 File';
  return cryptoDemo.decrypt(m.text||'');
}

let attachMenuEl = null;
function openAttachMenu(){
  closeAttachMenu();
  const btn = els.btnAttach; if(!btn) return;
  const rect = btn.getBoundingClientRect();
  const menu = document.createElement('div'); attachMenuEl = menu;
  menu.style.position='fixed';
  menu.style.left = `${Math.max(8, rect.left - 4)}px`;
  menu.style.top = `${rect.top - 8 - 176}px`;
  menu.style.minWidth='200px';
  menu.style.background='var(--bg-elev)';
  menu.style.border='1px solid var(--border)';
  menu.style.borderRadius='12px';
  menu.style.boxShadow='var(--shadow)';
  menu.style.padding='6px';
  menu.style.zIndex='1000';
  menu.innerHTML = '';
  const mkItem = (label, fn)=>{ const b=document.createElement('button'); b.className='btn full'; b.style.margin='4px 0'; b.textContent=label; b.addEventListener('click', ()=>{ fn(); closeAttachMenu(); }); return b; };
  menu.appendChild(mkItem('Share image/video', ()=> pickFiles('image/*,video/*')));
  menu.appendChild(mkItem('Share document', ()=> pickFiles('*/*')));
  menu.appendChild(mkItem('Share location', shareLocation));
  menu.appendChild(mkItem('Share contact', shareContact));
  document.body.appendChild(menu);
  const onDocClick = (e)=>{ if(!menu.contains(e.target)){ closeAttachMenu(); document.removeEventListener('mousedown', onDocClick); } };
  setTimeout(()=> document.addEventListener('mousedown', onDocClick), 0);
}
function closeAttachMenu(){ if(attachMenuEl && attachMenuEl.parentNode){ attachMenuEl.parentNode.removeChild(attachMenuEl); } attachMenuEl=null; }

function pickFiles(accept){ els.filePicker.value=''; els.filePicker.accept = accept || '*/*'; els.filePicker.click(); }

async function handlePickedFiles(ev){
  const files = Array.from(ev.target.files||[]);
  if(!files.length) return;
  for(const f of files){
    let uploaded = await uploadFileMaybe(f);
    let type = 'file';
    if(f.type.startsWith('image/')) type = 'image';
    else if(f.type.startsWith('video/')) type = 'video';
    const payload = { url: uploaded.url, name: f.name, size: f.size, mime: f.type, provider: uploaded.provider, path: uploaded.path };
    const label = type==='image' ? 'Photo' : (type==='video' ? 'Video' : 'File');
    sendSpecialMessage(state.activeChatId, type, payload, label);
  }
}

async function uploadFileMaybe(file){
  // Attempts to upload to Supabase storage bucket 'uploads'; fallback to local object URL if not available.
  if(supabaseReady && state.user){
    try{
      const bucket = 'uploads';
      const path = `${state.user.id}/${Date.now()}-${file.name}`;
      const { data, error } = await supabase.storage.from(bucket).upload(path, file, { upsert: false, cacheControl: '3600', contentType: file.type });
      if(error) throw error;
      const { data: pub } = supabase.storage.from(bucket).getPublicUrl(path);
      if(pub?.publicUrl){ return { url: pub.publicUrl, provider: 'supabase', path }; }
    }catch(err){ console.warn('Upload failed, using local URL:', err?.message||err); }
  }
  return { url: URL.createObjectURL(file), provider: 'local', path: '' };
}

function shareLocation(){
  if(!navigator.geolocation){ alert('Geolocation not supported'); return; }
  navigator.geolocation.getCurrentPosition(pos=>{
    const { latitude: lat, longitude: lng } = pos.coords;
    sendSpecialMessage(state.activeChatId, 'location', { lat, lng }, 'Location');
  }, err=>{ alert('Unable to get location: '+ err.message); }, { enableHighAccuracy: true, timeout: 10000 });
}

async function shareContact(){
  try{
    if('contacts' in navigator && 'select' in navigator.contacts){
      const picked = await navigator.contacts.select(['name','tel','email'], { multiple: false });
      const p = picked?.[0];
      const payload = { name: (Array.isArray(p?.name)? p.name[0] : p?.name)||'Contact', phone: p?.tel?.[0]||'', email: p?.email?.[0]||'' };
      sendSpecialMessage(state.activeChatId, 'contact', payload, 'Contact');
      return;
    }
  }catch{}
  const name = prompt('Contact name:'); if(name===null) return;
  const phone = prompt('Phone (optional):')||''; const email = prompt('Email (optional):')||'';
  if(!name && !phone && !email) return;
  sendSpecialMessage(state.activeChatId, 'contact', { name, phone, email }, 'Contact');
}

function openViewer(payload, type){
  if(!els.viewerModal) return;
  els.viewerTitle.textContent = payload.name || 'Preview';
  const body = els.viewerBody; body.innerHTML = '';
  if(type==='image'){
    const img = document.createElement('img'); img.src = payload.url; img.alt = payload.name||''; img.style.maxWidth='100%'; img.style.borderRadius='12px'; body.appendChild(img);
  } else if(type==='video'){
    const vid = document.createElement('video'); vid.src = payload.url; vid.controls = true; vid.style.maxWidth='100%'; vid.style.borderRadius='12px'; body.appendChild(vid);
  } else if((payload.mime||'').includes('pdf') || (payload.name||'').toLowerCase().endsWith('.pdf')){
    const iframe = document.createElement('iframe'); iframe.src = payload.url; iframe.style.width='100%'; iframe.style.height='70vh'; body.appendChild(iframe);
  } else {
    const a = document.createElement('a'); a.href = payload.url; a.target = '_blank'; a.rel='noopener'; a.textContent = 'Open file'; body.appendChild(a);
  }
  els.viewerDownload.href = payload.url;
  els.viewerDownload.setAttribute('download', payload.name || 'file');
  els.viewerModal.showModal();
}

function attachFiles(ev){ /* deprecated, replaced by handlePickedFiles */ }

function scheduleMessagePrompt(){ const input = prompt('Send in how many minutes? (e.g., 10)'); const mins = Number(input); if(!Number.isFinite(mins) || mins <= 0) return; const when = Date.now() + mins*60*1000; els.scheduleBanner.hidden = false; els.scheduleBanner.textContent = `Message will be scheduled at ${new Date(when).toLocaleTimeString()}.`; }

function toggleInfoPanel(open){ els.infoPanel.setAttribute('aria-hidden', open? 'false':'true'); }
function openInfoPanel(){ renderChatInfo(state.activeChatId); toggleInfoPanel(true); }

function renderChatInfo(chatId){
  const container = document.getElementById('infoBody');
  container.innerHTML = '';
  const chat = state.chats.find(c=>c.id===chatId);
  if(!chat){ container.textContent = 'No chat selected.'; return; }
  const title = document.createElement('div'); title.className='title'; title.textContent = chat.name;
  const meta = document.createElement('div'); meta.className='muted'; meta.textContent = chat.type==='group' ? `${(chat.members||[]).length} members` : 'Direct message';
  const stats = document.createElement('div');
  const msgCount = (state.messages[chatId]||[]).length;
  stats.textContent = `Messages: ${msgCount}`;

  const actions = document.createElement('div'); actions.style.display='grid'; actions.style.gap='8px'; actions.style.margin='12px 0';
  if(chat.type==='group'){
    const rename = document.createElement('button'); rename.className='btn'; rename.textContent='Rename group'; rename.addEventListener('click', ()=>{ const nn = prompt('Group name:', chat.name); if(nn){ chat.name = nn; storage.save('chats', state.chats); renderChatList(); renderChatInfo(chatId); els.convTitle.textContent = nn; } }); actions.appendChild(rename);
  }
  const clear = document.createElement('button'); clear.className='btn'; clear.textContent = 'Clear messages'; clear.addEventListener('click', ()=> clearChat(chatId)); actions.appendChild(clear);
  const del = document.createElement('button'); del.className='btn danger'; del.textContent = 'Delete chat'; del.addEventListener('click', ()=> deleteChat(chatId)); actions.appendChild(del);

  // Pin/Unpin action
  const pin = document.createElement('button'); pin.className='btn'; pin.textContent = chat.pinned ? 'Unpin chat' : 'Pin chat'; pin.addEventListener('click', ()=>{ togglePinChat(chatId); renderChatInfo(chatId); renderChatList(); }); actions.appendChild(pin);
  container.appendChild(title); container.appendChild(meta); container.appendChild(stats); container.appendChild(actions);

  if(chat.type==='group'){
    const header = document.createElement('div'); header.style.marginTop='8px'; header.textContent = 'Members'; container.appendChild(header);
    const list = document.createElement('div'); list.className='list';
    const members = (chat.members||[]).map(id=> state.contacts.find(c=>c.id===id) || {id, name:id});
    for(const m of members){ const row = document.createElement('div'); row.className='row between'; row.style.padding='6px 0'; row.innerHTML = `<div>${m.name}</div><div class="muted">${m.id}</div>`; list.appendChild(row); }
    container.appendChild(list);
  } else if(chat.type==='dm'){
    const peer = state.contacts.find(c=>c.id===chat.peerId) || { id: chat.peerId, name: chat.name };
    const section = document.createElement('div'); section.style.marginTop='8px'; section.innerHTML = `<div class="row between"><div>Contact</div><div class="muted">${peer.id}</div></div>`; container.appendChild(section);
  }
}

function clearChat(chatId){
  if(!confirm('Clear all messages in this chat?')) return;
  state.messages[chatId] = [];
  const chat = state.chats.find(c=>c.id===chatId);
  if(chat){ chat.lastTime = 0; chat.lastPreview = ''; }
  storage.save('messages', state.messages); storage.save('chats', state.chats);
  renderConversation(chatId); renderChatInfo(chatId);
}

function togglePinChat(chatId){ const chat = state.chats.find(c=>c.id===chatId); if(!chat) return; chat.pinned = !chat.pinned; storage.save('chats', state.chats); }

function deleteChat(chatId){
  if(!confirm('Delete this chat and all its messages?')) return;
  const i = state.chats.findIndex(c=>c.id===chatId);
  if(i!==-1) state.chats.splice(i,1);
  delete state.messages[chatId];
  storage.save('chats', state.chats); storage.save('messages', state.messages);
  toggleInfoPanel(false);
  if(state.activeChatId===chatId){ const next = state.chats[0]?.id; state.activeChatId=null; renderChatList(); renderConversation(next); } else { renderChatList(); }
}

function renderContacts(){
  const list = document.getElementById('contactList');
  const q = (document.getElementById('contactSearch')?.value||'').toLowerCase();
  list.innerHTML = '';
  state.contacts
    .filter(c=>!q || c.name.toLowerCase().includes(q) || (c.bio||'').toLowerCase().includes(q))
    .forEach(c=>{
      const item = document.createElement('button');
      item.className = 'chat-item';
      item.dataset.id = c.id;
      const selected = state.groupSelected.has(c.id);
      if(selected) item.classList.add('selected');
      const check = state.groupSelectMode ? `<div class="avatar" style="display:grid;place-items:center;font-weight:700">${selected?'✓':''}</div>` : '<div class="avatar"></div>';
      item.innerHTML = `${check}<div class="meta"><div class="name">${c.name}</div><div class="preview">${c.bio||''}</div></div>`;
      item.addEventListener('click', ()=> { if(state.groupSelectMode){ toggleContactSelection(c.id, item); } else { startChatWith(c); } });
      list.appendChild(item);
    });
}

function toggleContactSelection(id, itemEl){ if(state.groupSelected.has(id)) state.groupSelected.delete(id); else state.groupSelected.add(id); if(itemEl){ itemEl.classList.toggle('selected'); itemEl.querySelector('.avatar').textContent = state.groupSelected.has(id)? '✓' : ''; } updateGroupCreateButton(); }
function updateGroupCreateButton(){ if(!els.btnCreateGroup) return; const n = state.groupSelected.size; if(!state.groupSelectMode){ els.btnCreateGroup.textContent = 'Create group'; els.btnCreateGroup.disabled = false; } else { els.btnCreateGroup.textContent = `Create group (${n})`; els.btnCreateGroup.disabled = n < 2; } }

function onCreateGroupClick(){
  if(!state.groupSelectMode){ state.groupSelectMode = true; state.groupSelected = new Set(); renderContacts(); updateGroupCreateButton(); return; }
  const n = state.groupSelected.size; if(n < 2){ alert('Select at least 2 contacts for a group.'); return; }
  const members = Array.from(state.groupSelected);
  const memberNames = state.contacts.filter(c=>members.includes(c.id)).map(c=>c.name);
  const defaultName = memberNames.slice(0,2).join(', ') + (memberNames.length>2? ` & ${memberNames.length-2} others`:'');
  const name = prompt('Group name:', defaultName) || defaultName || 'New Group';
  createGroupChat(name, members);
}

function createGroupChat(name, memberIds){
  const allMembers = Array.from(new Set([state.user?.id, ...memberIds].filter(Boolean)));
  const chat = { id: 'c-'+Date.now(), type:'group', name, members: allMembers, lastTime: 0, lastPreview: '', presence: `${allMembers.length} members` };
  state.chats.unshift(chat); storage.save('chats', state.chats); state.messages[chat.id] = []; storage.save('messages', state.messages);
  els.newChatModal.close(); state.groupSelectMode = false; state.groupSelected = new Set(); renderChatList(); renderConversation(chat.id);
}

function startChatWith(contact){
  let chat = state.chats.find(c=>c.type==='dm' && c.peerId===contact.id);
  if(!chat){ chat = { id: 'c-'+Date.now(), type:'dm', peerId:contact.id, name:contact.name, lastTime:0, lastPreview:'', presence:'online' }; state.chats.unshift(chat); storage.save('chats', state.chats); }
  els.newChatModal.close(); renderChatList(); renderConversation(chat.id);
}

function translateLastMessage(){ const chatId = state.activeChatId; if(!chatId) return; const msgs = state.messages[chatId]||[]; const last = msgs[msgs.length-1]; if(!last) return; const original = cryptoDemo.decrypt(last.text); const translated = original.split('').reverse().join(''); last.text = cryptoDemo.encrypt(translated + ' (↔)'); storage.save('messages', state.messages); renderConversation(chatId); }
function speakLastMessage(){ const chatId = state.activeChatId; if(!chatId) return; const msgs = state.messages[chatId]||[]; const last = msgs[msgs.length-1]; if(!last) return; const text = cryptoDemo.decrypt(last.text); const utter = new SpeechSynthesisUtterance(text); speechSynthesis.cancel(); speechSynthesis.speak(utter); }
function insertAtCursor(char){ const input = els.messageInput; const start = input.selectionStart || input.value.length; input.value = input.value.slice(0,start) + char + input.value.slice(start); input.focus(); input.setSelectionRange(start+char.length,start+char.length); }
function smoothScrollTop(){ try{ window.scrollTo({ top:0, behavior:'smooth' }); }catch{ window.scrollTo(0,0); } }
function saveProfile(){ const name = document.getElementById('profileName').value.trim(); const bio = document.getElementById('profileBio').value.trim(); if(state.user){ state.user.name = name || state.user.name; state.user.bio = bio; storage.save('user', state.user); } }
function showTyping(show){ els.typing.hidden = !show; }

// Contacts sync
function injectSyncContactsButton(){
  const modalBody = els.newChatModal?.querySelector('.modal-body');
  if(!modalBody) return;
  if(!modalBody.querySelector('#btnSyncContacts')){
    const bar = document.createElement('div'); bar.style.display='flex'; bar.style.justifyContent='space-between'; bar.style.margin='8px 0';
    const syncBtn = document.createElement('button'); syncBtn.className='btn'; syncBtn.id='btnSyncContacts'; syncBtn.textContent='Sync contacts'; syncBtn.addEventListener('click', syncContactsFlow);
    bar.appendChild(syncBtn);
    modalBody.insertBefore(bar, modalBody.firstElementChild);
  }
  if(!document.getElementById('contactCsvInput')){
    const file = document.createElement('input'); file.type='file'; file.id='contactCsvInput'; file.accept='.csv'; file.hidden = true; file.addEventListener('change', async (e)=>{ const f = e.target.files?.[0]; if(f){ await importContactsFromCSV(f); e.target.value=''; } }); document.body.appendChild(file);
  }
}

async function syncContactsFlow(){
  try{
    if('contacts' in navigator && 'select' in navigator.contacts){
      const props = ['name','tel','email']; const opts = { multiple: true };
      const picked = await navigator.contacts.select(props, opts);
      const mapped = (picked||[]).map(p=>({ id: genContactId(p), name: Array.isArray(p.name)? p.name[0]: (p.name||'Friend'), bio:(p.email?.[0]||p.tel?.[0]||'') }));
      const added = mergeContacts(mapped);
      alert(`Synced ${added} new contacts.`);
      renderContacts();
    } else {
      // fallback to CSV import
      document.getElementById('contactCsvInput').click();
    }
  }catch(err){ alert('Contact sync failed: '+ err.message); }
}

function genContactId(entry){
  const raw = (Array.isArray(entry.email) && entry.email[0]) || (Array.isArray(entry.tel) && entry.tel[0]) || (Array.isArray(entry.name) && entry.name[0]) || Math.random().toString(36).slice(2);
  return 'u-'+hash(String(raw));
}

async function importContactsFromCSV(file){
  const text = await file.text();
  // simple CSV parser: name,phone,email
  const lines = text.split(/\r?\n/).map(l=>l.trim()).filter(Boolean);
  const out = [];
  for(const line of lines){
    const [name, phone, email] = line.split(',').map(s=> (s||'').trim());
    if(!name && !phone && !email) continue;
    const id = 'u-'+hash(email||phone||name);
    out.push({ id, name: name||email||phone||'Friend', bio: phone||email||'' });
  }
  const added = mergeContacts(out);
  alert(`Imported ${added} new contacts.`);
  renderContacts();
}

function mergeContacts(newContacts){
  let added = 0; const existing = new Set(state.contacts.map(c=>c.id));
  for(const c of newContacts){ if(!existing.has(c.id)){ state.contacts.push(c); existing.add(c.id); added++; } }
  storage.save('contacts', state.contacts);
  return added;
}

// Supabase helpers
function getSupabaseConfig(){ const q = new URLSearchParams(location.search); const url = localStorage.getItem('chitzy:sb:url') || window.CHITZY_SUPABASE_URL || q.get('supabaseUrl') || ''; const anon = localStorage.getItem('chitzy:sb:anon') || window.CHITZY_SUPABASE_ANON || q.get('supabaseAnon') || ''; if(url && anon) return { url, anon }; return null; }
async function setupSupabase(){ const cfg = getSupabaseConfig(); if(!cfg) return false; try{ const { createClient } = await import('https://esm.sh/@supabase/supabase-js@2'); supabase = createClient(cfg.url, cfg.anon); supabaseReady = true; const { data: { session } } = await supabase.auth.getSession(); if(session?.user){ state.user = mapSbUser(session.user); storage.save('user', state.user); } supabase.auth.onAuthStateChange((event, session) => { if(session?.user){ state.user = mapSbUser(session.user); storage.save('user', state.user); showChatView(); } else { state.user = null; storage.save('user', null); showAuthView(); } }); return true; } catch(err){ console.warn('Supabase init failed', err); supabaseReady = false; return false; } }
function mapSbUser(user){ const name = user.user_metadata?.name || (user.email ? user.email.split('@')[0] : 'User'); return { id: user.id, name, avatar: user.user_metadata?.avatar_url || '', bio: user.user_metadata?.bio || '' }; }
async function oauth(provider){ if(!supabaseReady) return; const { error } = await supabase.auth.signInWithOAuth({ provider, options: { redirectTo: location.origin } }); if(error) alert(error.message); }
async function otpLogin(){ if(!supabaseReady) return; const id = prompt('Enter your email or phone for OTP:'); if(!id) return; try{ if(id.includes('@')){ const { error } = await supabase.auth.signInWithOtp({ email: id, options: { emailRedirectTo: location.origin } }); if(error) throw error; alert('Magic link sent to your email.'); } else { const { error } = await supabase.auth.signInWithOtp({ phone: id }); if(error) throw error; alert('OTP sent via SMS.'); } }catch(err){ alert('OTP login failed: ' + err.message); } }

// Provider handlers (choose Firebase or Supabase)
function handleGoogle(){ if(firebaseReady) return firebaseGoogleSignIn(); if(supabaseReady) return oauth('google'); alert('Configure Google login in Firebase or Supabase.'); }
function handleApple(){ if(supabaseReady) return oauth('apple'); alert('Configure Apple login in Supabase.'); }
function handlePhoneOtp(){ if(firebaseReady) return phoneLoginFirebase(); if(supabaseReady) return otpLogin(); alert('Configure phone/OTP login in Firebase or Supabase.'); }

// Firebase helpers
function getFirebaseConfig(){
  try{
    const inline = window.CHITZY_FIREBASE_CONFIG || null;
    const stored = localStorage.getItem('chitzy:fb:config');
    const fromLs = stored ? JSON.parse(stored) : null;
    return inline || fromLs || null;
  }catch{ return null; }
}

async function setupFirebase(){
  const cfg = getFirebaseConfig();
  if(!cfg) return false;
  try{
    const appMod = await import('https://www.gstatic.com/firebasejs/10.12.5/firebase-app.js');
    const authMod = await import('https://www.gstatic.com/firebasejs/10.12.5/firebase-auth.js');
    firebaseApp = appMod.initializeApp(cfg);
    firebaseAuth = authMod.getAuth(firebaseApp);
    firebaseReady = true;
    authMod.onAuthStateChanged(firebaseAuth, (user)=>{
      if(user){ state.user = mapFirebaseUser(user); storage.save('user', state.user); showChatView(); }
      else { if(!supabaseReady){ state.user = null; storage.save('user', null); showAuthView(); } }
    });
    return true;
  }catch(err){ console.warn('Firebase init failed', err); firebaseReady = false; return false; }
}

function mapFirebaseUser(user){
  return { id: user.uid, name: user.displayName || (user.email ? user.email.split('@')[0] : 'User'), avatar: user.photoURL || '', bio: '' };
}

async function firebaseGoogleSignIn(){
  try{
    const { GoogleAuthProvider, signInWithPopup } = await import('https://www.gstatic.com/firebasejs/10.12.5/firebase-auth.js');
    const provider = new GoogleAuthProvider();
    await signInWithPopup(firebaseAuth, provider);
  }catch(err){ alert('Google sign-in failed: ' + err.message); }
}

async function ensureRecaptcha(){
  if(recaptchaVerifier) return recaptchaVerifier;
  const { RecaptchaVerifier } = await import('https://www.gstatic.com/firebasejs/10.12.5/firebase-auth.js');
  recaptchaVerifier = new RecaptchaVerifier(firebaseAuth, 'recaptcha-container', { size: 'invisible' });
  return recaptchaVerifier;
}

async function phoneLoginFirebase(){
  try{
    const phone = prompt('Enter phone in E.164 format (e.g., +11234567890):'); if(!phone) return;
    const { signInWithPhoneNumber } = await import('https://www.gstatic.com/firebasejs/10.12.5/firebase-auth.js');
    await ensureRecaptcha();
    const confirmation = await signInWithPhoneNumber(firebaseAuth, phone, recaptchaVerifier);
    const code = prompt('Enter the verification code sent to your phone:'); if(!code) return;
    await confirmation.confirm(code);
  }catch(err){ alert('Phone login failed: ' + err.message); }
}

// Permissions & Biometric (demo)
async function requestPermissions(){
  const results = {};
  try{ if('Notification' in window){ results.notifications = await Notification.requestPermission(); } }catch{}
  try{
    if(navigator.mediaDevices?.getUserMedia){
      const stream = await navigator.mediaDevices.getUserMedia({ audio:true, video:true });
      stream.getTracks().forEach(t=>t.stop()); results.media = 'granted';
    }
  }catch{ results.media = 'denied'; }
  try{
    if(navigator.geolocation){
      await new Promise((res,rej)=> navigator.geolocation.getCurrentPosition(()=>res(), ()=>rej(), {timeout:3000}));
      results.location = 'granted';
    }
  }catch{ results.location = 'denied'; }
  try{
    if(navigator.storage?.persist){ results.storage = (await navigator.storage.persist()) ? 'persisted' : 'not persisted'; }
  }catch{}
  try{
    if(window.showOpenFilePicker){ await window.showOpenFilePicker({ multiple:false }); results.files = 'prompted'; }
  }catch{}
  alert('Permissions:\n' + JSON.stringify(results, null, 2));
}

function strToBuf(str){ return new TextEncoder().encode(str); }
function bufToB64Url(buf){ const b=String.fromCharCode(...new Uint8Array(buf)); return btoa(b).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,''); }
function b64UrlToBuf(b64){ b64=b64.replace(/-/g,'+').replace(/_/g,'/'); const pad='='.repeat((4-b64.length%4)%4); const bin=atob(b64+pad); const buf=new Uint8Array(bin.length); for(let i=0;i<bin.length;i++) buf[i]=bin.charCodeAt(i); return buf.buffer; }

async function enrollBiometric(){
  if(!window.PublicKeyCredential){ alert('WebAuthn not supported'); return; }
  const challenge = crypto.getRandomValues(new Uint8Array(32));
  const userId = state.user?.id || 'guest';
  const pubKey = {
    challenge,
    rp: { name: 'Chitzy', id: location.hostname },
    user: { id: strToBuf(userId), name: userId, displayName: userId },
    pubKeyCredParams: [{ type:'public-key', alg:-7 }],
    authenticatorSelection: { userVerification: 'preferred', authenticatorAttachment: 'platform', residentKey: 'preferred' },
    timeout: 60000,
  };
  try{
    const cred = await navigator.credentials.create({ publicKey: pubKey });
    const rawId = bufToB64Url(cred.rawId);
    localStorage.setItem('chitzy:webauthn:id', rawId);
    alert('Biometric enrolled on this device.');
  }catch(err){ alert('Enroll failed: '+ err.message); }
}

async function biometricSignIn(){
  const credId = localStorage.getItem('chitzy:webauthn:id');
  if(!window.PublicKeyCredential || !credId){ alert('No biometric enrolled on this device.'); return; }
  const challenge = crypto.getRandomValues(new Uint8Array(32));
  const pubKey = {
    challenge,
    timeout: 60000,
    userVerification: 'preferred',
    allowCredentials: [{ id: b64UrlToBuf(credId), type:'public-key', transports:['internal'] }]
  };
  try{
    const assertion = await navigator.credentials.get({ publicKey: pubKey });
    // Demo: Assume success. In production, send assertion to server for verification.
    if(!state.user){
      // If not logged in, create a local session (demo only)
      state.user = { id: 'webauthn-'+credId.slice(0,10), name: 'Passkey User', avatar:'', bio:'' };
      storage.save('user', state.user);
    }
    showChatView();
  }catch(err){ alert('Biometric sign-in failed: '+ err.message); }
}
 
// Utilities and demo data
function timeAgo(ts){ const s = Math.floor((Date.now()-ts)/1000); if(s<60) return `${s}s`; const m = Math.floor(s/60); if(m<60) return `${m}m`; const h = Math.floor(m/60); if(h<24) return `${h}h`; const d = Math.floor(h/24); return `${d}d`; }
function hash(str){ let h=0; for(let i=0;i<str.length;i++){ h=(h<<5)-h+str.charCodeAt(i); h|=0; } return Math.abs(h).toString(36); }
function demoSeedContacts(){ return [ { id:'u-a1', name:'Alex', bio:'Coffee lover ☕' }, { id:'u-b2', name:'Sam', bio:'Gamer 🎮' }, { id:'u-c3', name:'Taylor', bio:'Traveler 🌍' }, ]; }
function demoSeedChats(){ return [ { id:'c-general', type:'group', name:'Chitzy Crew', lastTime: Date.now()-1000*55, lastPreview:'Welcome to Chitzy!', presence:'104 members', members: ['u-a1'] }, { id:'c-a1', type:'dm', peerId:'u-a1', name:'Alex', lastTime: Date.now()-1000*60*5, lastPreview:'See you soon!', presence:'online' }, ]; }
function demoSeedMessages(chats){ const map = {}; for(const c of chats){ map[c.id] = [ { id:'m1', chatId:c.id, senderId:'u-a1', time:Date.now()-1000*3600, text: cryptoDemo.encrypt('Hey there 👋'), read:true, reactions:['👍'] }, { id:'m2', chatId:c.id, senderId:'u-bot', time:Date.now()-1000*120, text: cryptoDemo.encrypt('Welcome to Chitzy!'), read:true, reactions:['✨'] }, ]; } return map; }
