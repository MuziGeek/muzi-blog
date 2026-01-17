(()=>{var d={chat:'<svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path></svg>',close:'<svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>',send:'<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="22" y1="2" x2="11" y2="13"></line><polygon points="22 2 15 22 11 13 2 9 22 2"></polygon></svg>',user:'<svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path><circle cx="12" cy="7" r="4"></circle></svg>',bot:'<svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="11" width="18" height="10" rx="2"></rect><circle cx="12" cy="5" r="2"></circle><path d="M12 7v4"></path><line x1="8" y1="16" x2="8" y2="16"></line><line x1="16" y1="16" x2="16" y2="16"></line></svg>'},g=class p{config;container;isOpen=!1;messages=[];isGenerating=!1;abortController=null;hasInteracted=!1;constructor(e){this.config=e,this.container=document.createElement("div"),this.container.className="chat-widget-container",e.theme==="auto"||!e.theme?window.matchMedia&&window.matchMedia("(prefers-color-scheme: dark)").matches&&this.container.setAttribute("data-theme","dark"):this.container.setAttribute("data-theme",e.theme),this.init(),document.body.appendChild(this.container)}init(){this.render(),this.attachEventListeners()}render(){let e=this.config.avatar||"";this.container.innerHTML=`
      <div class="cw-window" id="cw-window">
        <div class="cw-header">
          <div class="cw-header-left">
            <div class="cw-logo-box">
              ${e?`<img src="${e}" alt="Assistant">`:`
              <svg viewBox="0 0 24 24" width="20" height="20" style="margin:6px; color:#333;" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="11" width="18" height="10" rx="2"></rect><circle cx="12" cy="5" r="2"></circle><path d="M12 7v4"></path></svg>
              `}
            </div>
            <div class="cw-header-info">
              <h3>Blog Assistant</h3>
              <p>CHAT IS ALL YOU NEED</p>
            </div>
          </div>
          <div class="cw-header-right">
            <button class="cw-close-btn" id="cw-close-btn">
              ${d.close}
            </button>
          </div>
        </div>
        
        <div class="cw-messages" id="cw-messages">
          <div class="cw-empty-state">
            <div class="cw-empty-icon">
             ${e?`<img src="${e}" style="width:100%;height:100%;object-fit:cover;border-radius:50%;" alt="Assistant">`:d.bot}
            </div>
            <h4 style="margin:0 0 8px 0; font-weight:600; font-size:16px;">Hi, \u6709\u4EC0\u4E48\u53EF\u4EE5\u5E2E\u4F60\u7684\u5417\uFF1F</h4>
            <p style="margin:0; font-size:13px; opacity:0.7;">\u8BE2\u95EE\u5173\u4E8E\u6587\u7AE0\u7684\u95EE\u9898\uFF0C\u6216\u63A2\u7D22\u66F4\u591A\u6280\u672F\u7EC6\u8282\u3002</p>
          </div>
        </div>
        
        <div class="cw-input-area">
          <textarea class="cw-input" id="cw-input" placeholder="\u8F93\u5165\u6D88\u606F..." rows="1"></textarea>
          <button class="cw-send-btn" id="cw-send-btn" disabled>
            ${d.send}
          </button>
        </div>
      </div>

      <div class="cw-toggle-container">
        <div class="cw-pulse-ring"></div>
        <button class="cw-toggle-btn" id="cw-toggle-btn" style="transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);">
          <div class="cw-toggle-bg-gradient"></div>
          <span style="position:relative; z-index:1; display: flex; align-items: center; justify-content: center; width: 100%; height: 100%;">
            ${e?`<img src="${e}" style="width: 100%; height: 100%; object-fit: cover; border-radius: 50%;" alt="Chat">`:d.chat}
          </span>
        </button>
      </div>
    `}attachEventListeners(){let e=this.container.querySelector(".cw-toggle-container"),s=this.container.querySelector("#cw-toggle-btn"),r=this.container.querySelector("#cw-close-btn"),i=this.container.querySelector("#cw-window"),t=this.container.querySelector("#cw-input"),o=this.container.querySelector("#cw-send-btn"),c=()=>{this.isOpen=!this.isOpen,this.isOpen?(i.classList.add("open"),e.style.opacity="0",e.style.visibility="hidden",e.style.pointerEvents="none",e.style.transform="scale(0.8)",setTimeout(()=>t.focus(),100)):(i.classList.remove("open"),e.style.opacity="1",e.style.visibility="visible",e.style.pointerEvents="auto",e.style.transform="scale(1)")};s.onclick=c,r.onclick=c,t.oninput=()=>{t.style.height="auto",t.style.height=Math.min(t.scrollHeight,120)+"px",o.disabled=!t.value.trim()&&!this.isGenerating};let a=async()=>{let n=t.value.trim();if(!(!n||this.isGenerating)){if(!this.hasInteracted){let l=this.container.querySelector("#cw-messages");l.innerHTML="",this.hasInteracted=!0}t.value="",t.style.height="48px",o.disabled=!0,await this.handleUserMessage(n)}};o.onclick=a,t.onkeydown=n=>{n.key==="Enter"&&!n.shiftKey&&(n.preventDefault(),a())}}addMessage(e,s){this.messages.push({role:e,content:s});let r=this.container.querySelector("#cw-messages"),i=document.createElement("div");return i.className=`cw-message ${e}`,i.innerHTML=this.formatContent(s),r.appendChild(i),this.scrollToBottom(),i}scrollToBottom(){let e=this.container.querySelector("#cw-messages");e.scrollTop=e.scrollHeight}formatContent(e){return e.replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/```([\s\S]*?)```/g,"<pre><code>$1</code></pre>").replace(/`([^`]+)`/g,"<code>$1</code>").replace(/\*\*([^*]+)\*\*/g,"<strong>$1</strong>").replace(/\[([^\]]+)\]\(([^)]+)\)/g,'<a href="$2" target="_blank">$1</a>').replace(/\n/g,"<br>")}async handleUserMessage(e){this.addMessage("user",e),this.isGenerating=!0;let s=this.container.querySelector("#cw-messages"),r=document.createElement("div");r.className="cw-message assistant",r.innerHTML='<span class="typing-indicator"><span></span><span></span><span></span></span>',s.appendChild(r),this.scrollToBottom();let i={role:"assistant",content:""};this.messages.push(i);try{this.abortController=new AbortController;let t=await fetch(this.config.endpoint,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({messages:this.messages.slice(0,-1),enableSearch:!0}),signal:this.abortController.signal});if(!t.ok){let n=await t.json().catch(()=>({}));throw new Error(n.error||`HTTP ${t.status}`)}if(!t.body)throw new Error("No response body");let o=t.body.getReader(),c=new TextDecoder,a="";for(r.innerHTML="";;){let{done:n,value:l}=await o.read();if(n)break;let w=c.decode(l,{stream:!0});a+=w,r.innerHTML=this.formatContent(a),this.scrollToBottom()}i.content=a}catch(t){r.textContent=`Error: ${t.message}`,r.style.color="#ef4444",this.messages.pop()}finally{this.isGenerating=!1,this.abortController=null}}static init(e){window.ChatWidgetInstance=new p(e)}};window.ChatWidget=g;})();
