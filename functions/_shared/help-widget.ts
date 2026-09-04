/** 嵌入產品 Web / LIFF 的問答小幫手（Shadow DOM） */
export function helpWidgetScript(): string {
  return `(function(){
var script=document.currentScript;
if(!script)return;
var brand=script.getAttribute('data-brand')||'';
var role=script.getAttribute('data-role')||'';
var key=script.getAttribute('data-key')||'';
var pagePath=script.getAttribute('data-page-path')||location.pathname||'';
var source=script.getAttribute('data-source')==='liff'?'liff':'web';
var base=script.src.replace(/\\/widget(?:\\.js)?(?:\\?.*)?$/,'');
if(!base||base===script.src) base=script.src.replace(/[^/]+$/,'');
base=base.replace(/\\/$/,'');

var host=document.createElement('div');
host.id='go-help-widget';
document.body.appendChild(host);
var root=host.attachShadow({mode:'open'});

var state={
  open:false,
  boot:null,
  sessionId:null,
  messages:[],
  loading:false,
  view:'chat',
  err:'',
  form:{name:'',phone:'',email:'',lineId:'',requestNote:''},
  sent:false
};

function color(){return (state.boot&&state.boot.brand&&state.boot.brand.primaryColor)||'#3B6D11';}
function luminance(hex){
  var h=hex.replace('#','');
  if(h.length===3)h=h[0]+h[0]+h[1]+h[1]+h[2]+h[2];
  var r=parseInt(h.slice(0,2),16)/255,g=parseInt(h.slice(2,4),16)/255,b=parseInt(h.slice(4,6),16)/255;
  return 0.2126*r+0.7152*g+0.0722*b;
}
function ink(){return luminance(color())>0.62?'#2E3B26':'#fff';}

function css(){
  var c=color(),t=ink();
  return ':host{all:initial;font-family:-apple-system,BlinkMacSystemFont,"PingFang TC","Noto Sans TC",sans-serif;}'+
    '.btn{position:fixed;right:16px;bottom:16px;z-index:2147483000;width:56px;height:56px;border-radius:50%;border:0;background:'+c+';color:'+t+';font-size:26px;font-weight:700;cursor:pointer;box-shadow:0 8px 24px rgba(0,0,0,.18);}'+
    '.panel{position:fixed;right:16px;bottom:80px;z-index:2147483000;width:min(380px,calc(100vw - 24px));height:min(560px,calc(100dvh - 100px));background:#fff;border-radius:16px;box-shadow:0 16px 48px rgba(0,0,0,.22);display:flex;flex-direction:column;overflow:hidden;color:#222;}'+
    '.hd{padding:12px 14px;background:'+c+';color:'+t+';display:flex;align-items:center;justify-content:space-between;gap:8px;}'+
    '.hd strong{font-size:14px;}'+
    '.hd button{background:transparent;border:0;color:inherit;cursor:pointer;font-size:13px;}'+
    '.msgs{flex:1;overflow:auto;padding:12px;display:flex;flex-direction:column;gap:8px;background:#f7f7f4;}'+
    '.bubble{max-width:88%;padding:8px 11px;border-radius:12px;font-size:13px;line-height:1.5;white-space:pre-wrap;}'+
    '.me{align-self:flex-end;background:'+c+';color:'+t+';}'+
    '.bot{align-self:flex-start;background:#fff;border:1px solid #e6e6e1;}'+
    '.cite{font-size:11px;color:#777;margin-top:4px;}'+
    '.qs{display:flex;flex-wrap:wrap;gap:6px;padding:0 12px 8px;background:#f7f7f4;}'+
    '.qs button{border:1px solid #ddd;background:#fff;border-radius:999px;padding:5px 10px;font-size:12px;cursor:pointer;}'+
    '.bar{display:flex;gap:6px;padding:10px;border-top:1px solid #eee;background:#fff;}'+
    '.bar input,.bar textarea,.form input,.form textarea{flex:1;border:1px solid #ddd;border-radius:10px;padding:8px 10px;font-size:14px;}'+
    '.bar button,.form button{border:0;border-radius:10px;background:'+c+';color:'+t+';padding:8px 12px;font-weight:700;cursor:pointer;}'+
    '.form{padding:12px;display:flex;flex-direction:column;gap:8px;overflow:auto;}'+
    '.err{color:#B85454;font-size:12px;padding:0 12px;}'+
    '.ok{padding:16px;font-size:14px;line-height:1.6;}';
}

function render(){
  var boot=state.boot;
  var title=boot?boot.brand.name+' 小幫手':'系統小幫手';
  var html='<style>'+css()+'</style>'+
    '<button class="btn" type="button" aria-label="開啟協助">?</button>';
  if(state.open){
    html+='<div class="panel" role="dialog" aria-label="'+title+'"><div class="hd"><strong>'+esc(title)+'</strong><div>'+
      (state.view==='chat'?'<button type="button" data-act="form">請客服聯繫我</button>':'<button type="button" data-act="chat">回對話</button>')+
      '<button type="button" data-act="close">關閉</button></div></div>';
    if(state.view==='form'){
      if(state.sent) html+='<div class="ok">已交給客服，我們會用你留的方式聯繫。</div>';
      else html+='<div class="form">'+
        '<input placeholder="姓名（必填）" data-f="name" value="'+esc(state.form.name)+'">'+
        '<input placeholder="電話（必填）" data-f="phone" value="'+esc(state.form.phone)+'">'+
        '<input placeholder="LINE ID（選填）" data-f="lineId" value="'+esc(state.form.lineId)+'">'+
        '<input placeholder="Email（選填）" data-f="email" value="'+esc(state.form.email)+'">'+
        '<textarea rows="4" placeholder="想請協助的事" data-f="requestNote">'+esc(state.form.requestNote)+'</textarea>'+
        (state.err?'<div class="err">'+esc(state.err)+'</div>':'')+
        '<button type="button" data-act="send-ticket">送出給客服</button></div>';
    } else {
      html+='<div class="msgs">';
      if(!state.messages.length && boot) html+='<div class="bubble bot">'+esc(boot.welcome)+'</div>';
      state.messages.forEach(function(m){
        html+='<div class="bubble '+(m.role==='user'?'me':'bot')+'">'+esc(m.content);
        if(m.citations&&m.citations.length) html+='<div class="cite">依 '+esc(m.citations.map(function(c){return '《'+c.title+'》';}).join('、'))+'</div>';
        html+='</div>';
      });
      if(state.loading) html+='<div class="bubble bot">正在查看說明文件…</div>';
      html+='</div>';
      if(boot&&boot.suggestedQuestions&&boot.suggestedQuestions.length && state.messages.length<2){
        html+='<div class="qs">'+boot.suggestedQuestions.map(function(q){return '<button type="button" data-q="'+esc(q)+'">'+esc(q)+'</button>';}).join('')+'</div>';
      }
      if(state.err) html+='<div class="err">'+esc(state.err)+'</div>';
      html+='<div class="bar"><input placeholder="輸入問題" data-input><button type="button" data-act="send">送出</button></div>';
    }
    html+='</div>';
  }
  root.innerHTML=html;
  bind();
}

function bind(){
  var btn=root.querySelector('.btn');
  if(btn) btn.addEventListener('click',function(){state.open=!state.open;state.err='';render();if(state.open&&!state.boot)boot();});
  root.querySelectorAll('[data-act]').forEach(function(el){
    el.addEventListener('click',function(){
      var act=el.getAttribute('data-act');
      if(act==='close'){state.open=false;render();}
      if(act==='form'){state.view='form';state.err='';if(!state.form.requestNote){var last=state.messages.filter(function(m){return m.role==='user';}).pop();state.form.requestNote=last?last.content:'';}render();}
      if(act==='chat'){state.view='chat';state.err='';render();}
      if(act==='send')send(root.querySelector('[data-input]'));
      if(act==='send-ticket')sendTicket();
    });
  });
  root.querySelectorAll('[data-q]').forEach(function(el){
    el.addEventListener('click',function(){ask(el.getAttribute('data-q')||'');});
  });
  root.querySelectorAll('[data-f]').forEach(function(el){
    el.addEventListener('input',function(){state.form[el.getAttribute('data-f')]=el.value;});
  });
  var input=root.querySelector('[data-input]');
  if(input) input.addEventListener('keydown',function(e){if(e.key==='Enter'){e.preventDefault();send(input);}});
}

function esc(s){return String(s||'').replace(/[&<>"']/g,function(ch){return ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]);});}

function api(path,opts){
  return fetch(base+'/'+path,{
    method:(opts&&opts.method)||'GET',
    headers:Object.assign({'Content-Type':'application/json','X-Help-Key':key},opts&&opts.headers||{}),
    body:opts&&opts.body?JSON.stringify(opts.body):undefined
  }).then(function(r){return r.json().then(function(d){if(!r.ok)throw new Error(d.error||r.statusText);return d;});});
}

function boot(){
  api('bootstrap?brand='+encodeURIComponent(brand)+'&role='+encodeURIComponent(role)+'&key='+encodeURIComponent(key))
    .then(function(d){state.boot=d;state.err='';render();})
    .catch(function(e){state.err=e.message||'無法載入小幫手';render();});
}

function send(input){
  var text=input&&input.value?input.value.trim():'';
  if(text)ask(text);
}

function ask(text){
  if(!text||state.loading)return;
  state.messages.push({role:'user',content:text});
  state.loading=true;state.err='';render();
  api('chat',{method:'POST',body:{brand:brand,key:key,role:role,message:text,sessionId:state.sessionId,pagePath:pagePath,source:source}})
    .then(function(d){
      state.sessionId=d.sessionId;
      state.messages.push({role:'assistant',content:d.answer,citations:d.citations||[],answered:d.answered});
      if(d.suggestedFollowups) state.boot=Object.assign({},state.boot,{suggestedQuestions:d.suggestedFollowups});
    })
    .catch(function(e){state.err=e.message||'回答失敗';})
    .then(function(){state.loading=false;render();});
}

function sendTicket(){
  state.err='';
  api('tickets',{method:'POST',body:{
    brand:brand,key:key,role:role,sessionId:state.sessionId,pagePath:pagePath,source:source,
    name:state.form.name,phone:state.form.phone,email:state.form.email,lineId:state.form.lineId,
    requestNote:state.form.requestNote
  }}).then(function(){state.sent=true;state.err='';render();})
    .catch(function(e){state.err=e.message||'送出失敗';render();});
}

render();
})();`;
}
