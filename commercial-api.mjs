export function createMemberApi({getToken,getUserId,fetchImpl=fetch,baseUrl='/api/public/rpc'}) {
 return async function rpc(name,args={}) {
  const userId=getUserId();
  if(!userId)throw new Error('Log in to use your member workspace.');
  const token=await getToken();
  if(!token||userId!==getUserId())throw new Error('Your account changed. Please reopen your workspace.');
  const response=await fetchImpl(`${baseUrl}/${name}`,{method:'POST',cache:'no-store',headers:{Authorization:`Bearer ${token}`,'Content-Type':'application/json'},body:JSON.stringify(args),signal:AbortSignal.timeout(20000)});
  if(userId!==getUserId())throw new Error('Your account changed. Please reopen your workspace.');
  const data=await response.json().catch(()=>null);
  if(!response.ok)throw new Error(data?.message||data?.error||'Your workspace could not be updated. Please retry.');
  if(userId!==getUserId())throw new Error('Your account changed. Please reopen your workspace.');
  return data;
 };
}
export function escapeMemberText(value='') {
 return String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
}
export function quoteStatusMessage(request) {
 if(!request)return '';
 const status={pending:'Your quote request is saved for review.',contacted:'Your request is being discussed.',activated:'Your request has been processed. Your account access is shown separately.',closed:'Your previous request is closed. You can send a new enquiry.'}[request.status]||'Your request is saved.';
 return `${status} No payment is collected on this page.`;
}
