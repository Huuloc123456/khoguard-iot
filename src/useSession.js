import {useCallback,useEffect,useState} from 'react';

const LOGIN_ERRORS={INVALID_CREDENTIALS:'Sai tên đăng nhập hoặc mật khẩu.',LOGIN_LOCKED:'Nhập sai quá 5 lần; tài khoản tạm khóa 60 giây.',
  FORBIDDEN_ORIGIN:'Trang này không được phép đăng nhập.',DATA_UNAVAILABLE:'Backend hoặc MySQL chưa sẵn sàng.'};
// The session lives in an HttpOnly cookie; the page only learns who is signed in from /api/auth/me.
export function useSession(enabled) {
  const [state,setState]=useState({status:'checking',user:null,error:''});
  const check=useCallback(async()=>{
    try {
      const response=await fetch('/api/auth/me',{cache:'no-store',signal:AbortSignal.timeout(5000)});
      if(response.status===401) return setState({status:'anonymous',user:null,error:''});
      if(!response.ok) throw new Error();
      setState({status:'signed_in',user:(await response.json()).user,error:''});
    } catch {setState({status:'unavailable',user:null,error:'Không kết nối được backend để kiểm tra phiên đăng nhập.'});}
  },[]);
  useEffect(()=>{if(enabled) void check();},[enabled,check]);
  async function login(username,password) {
    setState(s=>({...s,error:'',busy:true}));
    try {
      const response=await fetch('/api/auth/login',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({username,password}),signal:AbortSignal.timeout(8000)});
      const body=await response.json().catch(()=>({}));
      if(!response.ok) return setState({status:'anonymous',user:null,error:LOGIN_ERRORS[body.error?.code] ?? 'Không đăng nhập được.'});
      await check();
    } catch {setState({status:'anonymous',user:null,error:'Không kết nối được backend.'});}
  }
  async function logout() {
    try {await fetch('/api/auth/logout',{method:'POST',headers:{'content-type':'application/json'},body:'{}',signal:AbortSignal.timeout(5000)});} catch {}
    setState({status:'anonymous',user:null,error:''});
  }
  const expired=useCallback(()=>setState({status:'anonymous',user:null,error:'Phiên đăng nhập đã hết hoặc bị đăng xuất. Hãy đăng nhập lại.'}),[]);
  return {...state,login,logout,expired,retry:check};
}
