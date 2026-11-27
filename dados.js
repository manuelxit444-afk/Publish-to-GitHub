/* Camada de dados compartilhada entre a loja e o painel. */
const Nexo = (() => {
  const config = window.NEXO_CONFIG;
  const demo = !config.supabaseUrl && !config.supabaseKey;
  const prefix = 'nexotech-beta-demo-';
  const uuid = () => crypto.randomUUID();
  const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const money = cents => (Number(cents)/100).toLocaleString('pt-BR',{style:'currency',currency:'BRL'});
  const normal = v => String(v).normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
  const read = (key, fallback) => { try { return JSON.parse(localStorage.getItem(key)) ?? fallback; } catch { return fallback; } };
  const write = (key,v) => { try { localStorage.setItem(key, JSON.stringify(v)); } catch { throw Error('Armazenamento local cheio ou indisponível. Tente uma imagem menor.'); } };
  const categories = ['Periféricos','Hardware','Acessórios'].map((name,i)=>({id:`cat-${i+1}`,name}));
  const initial = [
    ['Teclado Bluetooth',0,10990,12,'teclado','Teclado compacto sem fio para o dia a dia. Modelo demonstrativo.'],
    ['Mouse Gamer RGB',0,5990,20,'mouse','Mouse com iluminação RGB e formato confortável. Modelo demonstrativo.'],
    ['SSD 480 GB',1,18990,8,'ssd','Armazenamento de 480 GB para computadores compatíveis. Modelo demonstrativo.'],
    ['Hub USB-C',2,7990,10,'hub','Expanda suas conexões com um hub compacto. Modelo demonstrativo.']
  ].map((p,i)=>({id:`produto-${i+1}`,name:p[0],category_id:categories[p[1]].id,price_cents:p[2],stock:p[3],art:p[4],description:p[5],active:true,image_url:''}));
  function state(){ return read(prefix+'db',{products:initial,categories,orders:[]}); }
  function save(s){write(prefix+'db',s);}
  let client;
  const result = async query => { const {data,error}=await query; if(error) throw Error(error.message); return data; };
  async function init(){
    if(demo){if(!localStorage.getItem(prefix+'db'))save(state()); return;}
    if(!config.supabaseUrl || !config.supabaseKey)throw Error('Preencha URL e chave pública em config.js.');
    if(config.supabaseKey.startsWith('sb_secret_'))throw Error('Use somente a chave pública.');
    if(config.supabaseKey.includes('.')){try{const payload=JSON.parse(atob(config.supabaseKey.split('.')[1].replace(/-/g,'+').replace(/_/g,'/')));if(payload.role!=='anon')throw Error();}catch{throw Error('A chave JWT deve ser a anon key pública.');}}
    await new Promise((resolve,reject)=>{const s=document.createElement('script');s.src='https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2';s.onload=resolve;s.onerror=()=>reject(Error('Não foi possível carregar o Supabase. Verifique sua internet.'));document.head.append(s);});
    client=window.supabase.createClient(config.supabaseUrl,config.supabaseKey);
  }
  async function user(){if(demo)return read(prefix+'user',null);const session=await result(client.auth.getSession());return session.session?.user ?? null;}
  async function isAdmin(){const u=await user();if(!u)return false;if(demo)return u.id==='demo-admin';return await result(client.rpc('is_admin'));}
  async function demoLogin(admin=false){if(!demo)throw Error('Somente demonstração.');const u={id:admin?'demo-admin':'demo-cliente',email:admin?'admin@demo.invalid':'cliente@demo.invalid'};write(prefix+'user',u);return u;}
  async function login(email,password){return result(client.auth.signInWithPassword({email,password}));}
  async function signup(email,password){return result(client.auth.signUp({email,password}));}
  async function logout(){if(demo)localStorage.removeItem(prefix+'user');else await result(client.auth.signOut());}
  async function catalog(admin=false){if(demo){const s=state();return {products:s.products.filter(p=>admin||p.active),categories:s.categories};}return {products:await result(client.from('products').select('*').order('name')),categories:await result(client.from('categories').select('*').order('name'))};}
  async function upload(file){
    if(!(await isAdmin()))throw Error('Acesso restrito.');
    if(!['image/jpeg','image/png','image/webp'].includes(file.type)||file.size>2*1024*1024)throw Error('Use JPG, PNG ou WebP de até 2 MB.');
    if(demo)return new Promise((resolve,reject)=>{const r=new FileReader();r.onload=()=>resolve(r.result);r.onerror=reject;r.readAsDataURL(file);});
    const path=uuid()+'.'+({'image/jpeg':'jpg','image/png':'png','image/webp':'webp'}[file.type]);
    await result(client.storage.from('product-images').upload(path,file,{contentType:file.type}));return client.storage.from('product-images').getPublicUrl(path).data.publicUrl;
  }
  async function saveProduct(p){if(!(await isAdmin()))throw Error('Acesso restrito.');if(demo){const s=state();const id=p.id||uuid();s.products=s.products.filter(x=>x.id!==id).concat({...p,id});save(s);return;}const {id,...data}=p;await result(id?client.from('products').update(data).eq('id',id):client.from('products').insert(data));}
  async function saveCategory(name,id){if(!(await isAdmin()))throw Error('Acesso restrito.');if(demo){const s=state();if(s.categories.some(c=>normal(c.name)===normal(name)&&c.id!==id))throw Error('Categoria já existe.');const k=id||uuid();s.categories=s.categories.filter(c=>c.id!==k).concat({id:k,name});save(s);return;}await result(id?client.from('categories').update({name}).eq('id',id):client.from('categories').insert({name}));}
  async function orders(admin=false){const u=await user();if(!u)throw Error('Entre na sua conta.');if(demo)return state().orders.filter(o=>admin&&u.id==='demo-admin'||o.user_id===u.id).slice().reverse();let q=client.from('orders').select('*,order_items(*)').order('created_at',{ascending:false});if(!admin)q=q.eq('user_id',u.id);return result(q);}
  async function place(items,customer,phone,delivery,requestId){const u=await user();if(!u)throw Error('Entre na sua conta.');if(demo){const s=state();const existing=s.orders.find(o=>o.id===requestId&&o.user_id===u.id);if(existing)return existing;const lines=items.map(i=>{const p=s.products.find(x=>x.id===i.product_id&&x.active);if(!p||!Number.isInteger(i.quantity)||i.quantity<1||i.quantity>p.stock||i.quantity>99)throw Error('Estoque ou quantidade indisponível. Atualize o carrinho.');return {product_id:p.id,name:p.name,quantity:i.quantity,price_cents:p.price_cents};});if(!lines.length)throw Error('Carrinho vazio.');const o={id:requestId,user_id:u.id,customer,phone,delivery,status:'pending',total_cents:lines.reduce((t,i)=>t+i.price_cents*i.quantity,0),created_at:new Date().toISOString(),order_items:lines};s.orders.push(o);save(s);return o;}const id=await result(client.rpc('create_order',{p_id:requestId,p_items:items,p_customer:customer,p_phone:phone,p_delivery:delivery}));return result(client.from('orders').select('*,order_items(*)').eq('id',id).single());}
  async function status(id,next){if(!(await isAdmin()))throw Error('Acesso restrito.');if(demo){const s=state();const o=s.orders.find(x=>x.id===id);if(!o||!transitions(o.status).includes(next))throw Error('Transição inválida.');if(o.status==='pending'&&next==='confirmed'){for(const i of o.order_items){const p=s.products.find(x=>x.id===i.product_id);if(!p||!p.active||p.stock<i.quantity)throw Error('Estoque insuficiente para confirmar.');p.stock-=i.quantity;}}if(o.status==='confirmed'&&next==='canceled'){for(const i of o.order_items)s.products.find(p=>p.id===i.product_id).stock+=i.quantity;}o.status=next;save(s);return;}await result(client.rpc('change_order_status',{p_id:id,p_status:next}));}
  const transitions = s => ({pending:['confirmed','canceled'],confirmed:['completed','canceled'],completed:[],canceled:[]}[s]||[]);
  const labels={pending:'Aguardando confirmação',confirmed:'Confirmado',completed:'Concluído',canceled:'Cancelado'};
  return {config,demo,uuid,esc,money,normal,read,write,init,user,isAdmin,demoLogin,login,signup,logout,catalog,upload,saveProduct,saveCategory,orders,place,status,transitions,labels};
})();
const desenhos = {
  teclado: `<g transform="rotate(-12 100 65)"><rect x="12" y="30" width="176" height="75" rx="8" fill="#333b45" stroke="#171d25" stroke-width="3"/>${Array.from({length:48},(_,i)=>`<rect x="${20+(i%12)*13.4}" y="${38+Math.floor(i/12)*14}" width="10" height="10" rx="1.5" fill="#141a22" stroke="#717b88" stroke-width=".7"/>`).join('')}<rect x="70" y="94" width="60" height="5" rx="2" fill="#171d25"/></g>`,
  mouse: '<g transform="rotate(-24 100 70)"><path d="M100 10c-30 0-43 22-43 53v21c0 29 18 43 43 43s43-14 43-43V63c0-31-13-53-43-53Z" fill="#21272e" stroke="#0d1015" stroke-width="3"/><path d="M100 12v47M59 60h82" stroke="#555e6b" fill="none"/><rect x="95" y="27" width="10" height="21" rx="5" fill="#fd536c"/><path d="M63 88q7 25 32 32" stroke="#28c9ef" stroke-width="4" fill="none"/><path d="M105 120q24-8 31-29" stroke="#8f58fa" stroke-width="4" fill="none"/></g>',
  ssd: '<g transform="rotate(-15 100 65)"><rect x="25" y="17" width="150" height="96" rx="7" fill="#303640" stroke="#151a21" stroke-width="3"/><rect x="34" y="25" width="132" height="78" rx="4" fill="#242a32"/><text x="100" y="65" text-anchor="middle" fill="#d9e1ea" font-size="24" font-family="Arial" font-weight="bold">SSD</text><text x="100" y="83" text-anchor="middle" fill="#a0abb9" font-size="12">480 GB</text></g>',
  hub: '<g transform="rotate(-15 100 65)"><rect x="20" y="45" width="117" height="39" rx="5" fill="#a2aab6" stroke="#596473" stroke-width="2"/><path d="M137 60q49-19 45 20l-12 12" stroke="#252a33" stroke-width="6" fill="none"/><rect x="158" y="90" width="18" height="11" rx="2" fill="#626b79"/><rect x="32" y="72" width="22" height="8" rx="1" fill="#184983"/><rect x="61" y="72" width="22" height="8" rx="1" fill="#184983"/><rect x="93" y="72" width="17" height="8" rx="1" fill="#2b3038"/></g>'
};

// Somente imagens em formatos e protocolos esperados; textos do banco são escapados.
function imagemProduto(p){const src=String(p.image_url||'');if(/^https:\/\//i.test(src)||/^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/.test(src))return `<img src="${Nexo.esc(src)}" alt="${Nexo.esc(p.name)}" loading="lazy">`;return `<svg viewBox="0 0 200 130" role="img" aria-label="Ilustração de ${Nexo.esc(p.name)}">${Object.hasOwn(desenhos,p.art)?desenhos[p.art]:'<rect x="65" y="30" width="70" height="70" rx="10" fill="#cbd5e1"/><path d="M75 85l20-25 15 15 12-10 13 20" fill="none" stroke="#64748b" stroke-width="4"/>'}</svg>`;}
