import React from 'react';

/* Self-contained styles: the builder's stylesheet is injected by
   RogueTraderBuilder, which does not render until you are signed in. */
const CSS = `
.rt-login{min-height:100vh;display:grid;place-items:center;padding:24px;
  background:
    radial-gradient(115% 70% at 50% -5%,#141b14 0%,transparent 58%),
    radial-gradient(90% 60% at 50% 105%,#0f1712 0%,transparent 60%),
    #070a08;
  color:#cfdcd2;
  font-family:"EB Garamond","Iowan Old Style",Palatino,Georgia,serif;
  -webkit-font-smoothing:antialiased;}
.rt-login *{box-sizing:border-box;}
.rt-login-c{position:relative;width:min(430px,100%);padding:30px 26px 26px;
  border-radius:5px;text-align:center;
  background:linear-gradient(180deg,#6a5a36,#3a3120 20%,#272115 80%,#4a3f27);
  box-shadow:inset 0 0 0 1px rgba(201,169,97,.4),inset 0 0 0 4px rgba(0,0,0,.42),
    0 8px 26px -10px rgba(0,0,0,.85);}
.rt-login-c::before{content:"";position:absolute;inset:9px;border-radius:11px;
  background:radial-gradient(125% 95% at 50% 4%,#22392b 0%,#152319 46%,#0a130e 100%);
  box-shadow:inset 0 0 46px rgba(0,0,0,.8),inset 0 1px 0 rgba(160,220,180,.12),
    0 0 0 1px rgba(0,0,0,.65);}
.rt-login-in{position:relative;z-index:1;}
.rt-login-s{width:44px;height:44px;margin:0 auto 16px;display:grid;place-items:center;
  color:#c9a961;background:linear-gradient(160deg,#2a2314,#0d1109);
  border:1px solid #8a7442;
  clip-path:polygon(50% 0,100% 25%,100% 75%,50% 100%,0 75%,0 25%);
  box-shadow:inset 0 0 12px rgba(201,169,97,.18);}
.rt-login-e{font-family:"IBM Plex Mono",ui-monospace,Menlo,monospace;font-size:9.5px;
  letter-spacing:.2em;color:#5f9a74;margin-bottom:9px;}
.rt-login-t{font-family:"Cinzel","Trajan Pro",Georgia,serif;font-size:20px;font-weight:700;
  letter-spacing:.1em;text-transform:uppercase;color:#e8ca74;margin:0 0 10px;line-height:1.25;
  text-shadow:0 0 26px rgba(201,169,97,.22);}
.rt-login-p{font-size:14.5px;line-height:1.6;color:#8fa596;margin:0 0 22px;}
.rt-login-b{display:inline-block;width:100%;padding:13px 16px;cursor:pointer;
  font-family:"Cinzel",Georgia,serif;font-weight:600;font-size:12.5px;
  letter-spacing:.13em;text-transform:uppercase;text-decoration:none;
  color:#f4dd94;border:1px solid #8a7442;
  background:linear-gradient(180deg,#22392c,#132019);
  box-shadow:inset 0 1px 0 rgba(201,169,97,.15);
  clip-path:polygon(9px 0,100% 0,100% calc(100% - 9px),calc(100% - 9px) 100%,0 100%,0 9px);
  transition:filter .14s,border-color .14s,color .14s;}
.rt-login-b:hover{border-color:#c9a961;color:#eef4ec;filter:brightness(1.2);}
.rt-login-b:focus-visible{outline:2px solid #e0b955;outline-offset:2px;}
`;

export default function Login() {
  return (
    <div className="rt-login">
      <style>{CSS}</style>
      <div className="rt-login-c">
        <div className="rt-login-in">
          <div className="rt-login-s">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor"
              strokeWidth="1.3" strokeLinecap="round">
              <circle cx="12" cy="12" r="2.9" />
              <circle cx="12" cy="12" r="7.4" opacity=".5" />
              <path d="M12 1.6v3M12 19.4v3M1.6 12h3M19.4 12h3M4.6 4.6l2.1 2.1M17.3 17.3l2.1 2.1M19.4 4.6l-2.1 2.1M6.7 17.3l-2.1 2.1" />
            </svg>
          </div>
          <div className="rt-login-e">ROGUE TRADER / KORONUS EXPANSE</div>
          <h1 className="rt-login-t">Origin Path Cogitator</h1>
          <p className="rt-login-p">
            Six steps from home world to career, the dice that follow, and a dossier
            your crew can actually read at the table.
          </p>
          <a className="rt-login-b" href="/api/auth/google">Sign in with Google</a>
        </div>
      </div>
    </div>
  );
}
