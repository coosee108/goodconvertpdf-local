(function(root){
 const plans=[
  {id:'chatgpt',host:/^(chatgpt\.com|chat\.openai\.com)$/,selector:'[data-message-author-role="user"],[data-message-author-role="assistant"],[data-testid^="conversation-turn-"],[data-turn="user"],[data-turn="assistant"],[data-chatgpt-search-unit-key$=":user"],[data-chatgpt-search-unit-key$=":assistant"],[data-message-role="user"],[data-message-role="assistant"],[data-user-message-bubble],[data-conversation-role="assistant"],[data-chatgpt-agent-turn-start]'},
  {id:'claude',host:/^claude\.ai$/,selector:'[data-testid="user-message"],[data-testid="assistant-message"],[data-testid="user-message-container"],[data-testid="assistant-message-container"]'},
  {id:'gemini',host:/^(gemini\.google\.com|bard\.google\.com)$/,selector:'user-query,model-response,[data-testid="user-query"],[data-testid="model-response"]'}
 ];
 const esc=s=>String(s).replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
 const excluded='script,style,button,input,textarea,iframe,canvas,svg,math,[contenteditable="true"],[role="toolbar"],[data-testid*="action"],[data-testid*="composer"]';
 function role(node,plan){
  if(plan.id==='chatgpt'){
   const unit=node.getAttribute('data-chatgpt-search-unit-key')||'';
   if(unit.endsWith(':user'))return'user';if(unit.endsWith(':assistant'))return'assistant';
   if(node.hasAttribute('data-user-message-bubble'))return'user';
   if(node.matches('[data-conversation-role="assistant"],[data-chatgpt-agent-turn-start]'))return'assistant';
   const value=node.getAttribute('data-message-author-role')||node.getAttribute('data-turn')||node.getAttribute('data-message-role');
   if(value==='user'||value==='assistant')return value;
   const marked=[...node.querySelectorAll('[data-message-author-role="user"],[data-message-author-role="assistant"],[data-turn="user"],[data-turn="assistant"]')];
   const roles=new Set(marked.map(n=>n.getAttribute('data-message-author-role')||n.getAttribute('data-turn')));
   if(roles.size===1)return [...roles][0];
   const user=!!node.querySelector('.user-message-bubble-color'),assistant=!!node.querySelector('.agent-turn');
   if(user!==assistant)return user?'user':'assistant';
  }else if(plan.id==='claude'){
   const id=node.getAttribute('data-testid')||'';
   if(id.startsWith('user-message'))return'user';if(id.startsWith('assistant-message'))return'assistant';
  }else{
   if(node.matches('user-query,[data-testid="user-query"]'))return'user';
   if(node.matches('model-response,[data-testid="model-response"]'))return'assistant';
  }
  return null;
 }
 function contentNode(node,plan){
  if(plan.id!=='chatgpt'||node.matches('[data-message-author-role]'))return node;
  if(node.hasAttribute('data-chatgpt-search-unit-key'))return node.querySelector('[data-user-message-bubble],.markdown,.prose,[data-message-content]')||node;
  if(node.matches('[data-conversation-role="assistant"],[data-chatgpt-agent-turn-start]')){
   const shell=node.closest('[data-turn-key]');
   return shell?.querySelector('.markdown,.prose,[data-message-content]')||node;
  }
  return node.querySelector('[data-message-author-role],[data-message-content]')||node.querySelector('.markdown,.user-message-bubble-color')||node;
 }
 function extract(doc,host){
  const plan=plans.find(p=>p.host.test(host));
  if(!plan)return{title:doc.title,messages:[],warnings:['No verified adapter for this site. Paste conversation text instead.']};
  let nodes=[...doc.querySelectorAll(plan.selector)].filter(n=>!n.closest('nav,aside,form,[role="navigation"]'));
  if(plan.id==='chatgpt')nodes=nodes.filter(n=>{
   if(n.hasAttribute('data-chatgpt-search-unit-key'))return true;
   if(n.closest('[data-chatgpt-search-unit-key]'))return false;
   if(n.matches('[data-user-message-bubble],[data-conversation-role="assistant"],[data-chatgpt-agent-turn-start]'))return true;
   return !n.querySelector('[data-chatgpt-search-unit-key$=":user"],[data-chatgpt-search-unit-key$=":assistant"],[data-user-message-bubble],[data-conversation-role="assistant"],[data-chatgpt-agent-turn-start]');
  });
  nodes=nodes.filter(n=>!nodes.some(other=>other!==n&&other.contains(n)));
  const warnings=new Set(['Only currently loaded messages are included. Review against the original; virtualized history may be absent.']);
  function serialize(node){
   if(node.nodeType===3)return esc(node.textContent);
   if(node.nodeType!==1||node.hidden)return'';
   const tag=node.tagName.toLowerCase();
   if(['svg','canvas','math'].includes(tag)){warnings.add('Some rendered media or formulas were omitted. Check the source.');return'';}
   if(node.matches(excluded))return'';
   if(tag==='img'){warnings.add('Remote images were replaced by alt text; files are not uploaded or fetched.');return '<span>'+esc(node.getAttribute('alt')||'[Image]')+'</span>';}
   const children=[...node.childNodes].map(serialize).join('');
   if(tag==='a'){let href;try{const u=new URL(node.getAttribute('href'),doc.baseURI);if(['https:','http:'].includes(u.protocol))href=u.href;}catch{}return href?'<a href="'+esc(href)+'">'+children+'</a>':children;}
   if(['p','div','pre','code','table','thead','tbody','tr','th','td','ul','ol','li','strong','em','b','i','blockquote','h1','h2','h3','h4','h5','h6','br','hr'].includes(tag))return '<'+tag+'>'+children+(['br','hr'].includes(tag)?'':'</'+tag+'>');
   return children;
  }
  const messages=[];
  for(const node of nodes){
   const who=role(node,plan);if(!who)continue;
   const content=contentNode(node,plan),html=serialize(content);
   const copy=content.cloneNode(true);copy.querySelectorAll(excluded).forEach(n=>n.remove());
   const text=(copy.innerText||copy.textContent||'').trim();
   if(!text)continue;
   const turnId=node.getAttribute('data-testid')||'';
   const shell=node.closest('[data-turn-key]');
   messages.push({id:messages.length+1,role:who,text,html,sourceId:node.getAttribute('data-chatgpt-search-unit-key')||node.getAttribute('data-message-id')||(shell?.getAttribute('data-turn-key')?shell.getAttribute('data-turn-key')+':'+who:'')||(/^(conversation-turn-|.*-[0-9a-f]{8,}$)/.test(turnId)?turnId:'')});
  }
  if(!messages.length)warnings.add('This site layout was not recognized. Automatic import is unavailable; paste text instead.');
  return{platform:plan.id,title:doc.title,messages,count:messages.length,warnings:[...warnings]};
 }
 root.ChatAdapters={extract};if(typeof module==='object')module.exports=root.ChatAdapters;
})(typeof globalThis!=='undefined'?globalThis:this);
