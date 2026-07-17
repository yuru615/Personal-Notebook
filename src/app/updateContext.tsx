import {useCallback,useEffect,useMemo,useRef,useState} from 'react'
import {Download,LoaderCircle,RefreshCw,RotateCcw,X} from 'lucide-react'
import {createTauriUpdateClient,type ClientUpdateInfo,type UpdateClient} from '../lib/updateClient'
import {UpdateContext,type UpdateContextValue,type UpdatePhase} from './updateContextValue'
let initialCheckPromise:Promise<ClientUpdateInfo|null>|null=null

export function UpdateProvider({children,client:injectedClient}:{children:React.ReactNode;client?:UpdateClient|null}){
  const client=useMemo(()=>injectedClient===undefined?createTauriUpdateClient():injectedClient,[injectedClient])
  const [currentVersion,setCurrentVersion]=useState('0.1.0')
  const [info,setInfo]=useState<ClientUpdateInfo|null>(null)
  const [phase,setPhase]=useState<UpdatePhase>(client?'checking':'idle')
  const [progress,setProgress]=useState(0)
  const [message,setMessage]=useState('')
  const [initialComplete,setInitialComplete]=useState(!client)
  const [dialogHidden,setDialogHidden]=useState(false)
  const [offlineBypass,setOfflineBypass]=useState(false)
  const beforeInstallRef=useRef<(()=>Promise<void>)|null>(null)
  const injectedInitialCheckRef=useRef<Promise<ClientUpdateInfo|null>|null>(null)
  const registerBeforeInstall=useCallback((handler:(()=>Promise<void>)|null)=>{beforeInstallRef.current=handler},[])

  const applyCheckResult=useCallback((result:ClientUpdateInfo|null,manual:boolean)=>{
    setInfo(result)
    setDialogHidden(false)
    setOfflineBypass(false)
    setPhase(result?'available':'idle')
    setMessage(manual&&!result?'当前已是最新版本。':'')
  },[])

  useEffect(()=>{
    if(!client)return
    let active=true
    void client.currentVersion().then(version=>{if(active)setCurrentVersion(version)}).catch(()=>undefined)
    const checkPromise=injectedClient===undefined
      ?(initialCheckPromise??=client.check())
      :(injectedInitialCheckRef.current??=client.check())
    void checkPromise.then(result=>{if(active)applyCheckResult(result,false)}).catch(()=>{if(active){setPhase('idle');setMessage('暂时无法检查更新，已进入离线模式。')}}).finally(()=>{if(active)setInitialComplete(true)})
    return()=>{active=false}
  },[applyCheckResult,client,injectedClient])

  const checkForUpdates=useCallback(async()=>{
    if(!client)return
    setPhase('checking');setMessage('');setProgress(0)
    try{applyCheckResult(await client.check(),true)}
    catch{setPhase(info?'available':'idle');setMessage('检查更新失败，请稍后重试。')}
  },[applyCheckResult,client,info])

  const installUpdate=useCallback(async()=>{
    if(!client||!info)return
    setDialogHidden(false);setOfflineBypass(false);setPhase('downloading');setProgress(0);setMessage('')
    try{
      await client.download((downloaded,total)=>{
        const expected=total??info.fileSize
        setProgress(expected&&expected>0?Math.min(100,Math.round(downloaded/expected*100)):0)
      })
      await beforeInstallRef.current?.()
      setPhase('installing');setProgress(100)
      await client.install()
      await client.relaunch()
    }catch(cause){setPhase('error');setMessage(normalizeUpdateError(cause))}
  },[client,info])

  const value=useMemo<UpdateContextValue>(()=>({
    currentVersion,info,phase,progress,message,checkForUpdates,installUpdate,
    registerBeforeInstall,
  }),[checkForUpdates,currentVersion,info,installUpdate,message,phase,progress,registerBeforeInstall])

  if(!initialComplete)return <UpdateLoading/>
  const mandatory=Boolean(info?.mandatory&&!offlineBypass)
  return <UpdateContext.Provider value={value}>
    {mandatory?null:children}
    {info&&(!dialogHidden||mandatory)?<UpdatePrompt
      info={info}
      phase={phase}
      progress={progress}
      message={message}
      mandatory={mandatory}
      onInstall={()=>void installUpdate()}
      onDismiss={()=>setDialogHidden(true)}
      onRetry={()=>void checkForUpdates()}
      onOffline={()=>setOfflineBypass(true)}
    />:null}
  </UpdateContext.Provider>
}

function UpdateLoading(){return <main className="update-gate"><LoaderCircle className="update-spin" aria-hidden="true"/><p>正在检查客户端版本...</p></main>}

function UpdatePrompt({info,phase,progress,message,mandatory,onInstall,onDismiss,onRetry,onOffline}:{info:ClientUpdateInfo;phase:UpdatePhase;progress:number;message:string;mandatory:boolean;onInstall:()=>void;onDismiss:()=>void;onRetry:()=>void;onOffline:()=>void}){
  const busy=phase==='downloading'||phase==='installing'
  return <div className={mandatory?'update-gate':'update-overlay'} role={mandatory?'main':'presentation'}>
    <section className="update-dialog" role="dialog" aria-modal="true" aria-labelledby="update-title">
      {!mandatory&&!busy?<button type="button" className="update-icon-button" aria-label="稍后更新" onClick={onDismiss}><X aria-hidden="true"/></button>:null}
      <div className="update-dialog-icon"><Download aria-hidden="true"/></div>
      <div><p className="update-eyebrow">知栖客户端更新</p><h1 id="update-title">发现新版本 {info.version}</h1><p className="update-version-line">当前版本 {info.currentVersion}{info.minimumVersion?` · 最低支持 ${info.minimumVersion}`:''}</p></div>
      {info.notes?<p className="update-notes">{info.notes}</p>:null}
      {busy?<div className="update-progress" role="status"><div className="update-progress-track"><span style={{width:`${progress}%`}}/></div><p>{phase==='installing'?'正在安装并准备重启...':`正在下载... ${progress}%`}</p></div>:null}
      {message?<p className="update-error" role="alert">{message}</p>:null}
      <div className="update-actions">
        {phase==='error'?<button type="button" className="account-auth-secondary" onClick={onRetry}><RefreshCw aria-hidden="true"/>重新检查</button>:null}
        {mandatory&&phase==='error'?<button type="button" className="account-auth-secondary" onClick={onOffline}>本次离线使用</button>:null}
        {!mandatory&&!busy?<button type="button" className="account-auth-secondary" onClick={onDismiss}>稍后</button>:null}
        <button type="button" className="account-auth-primary" disabled={busy} onClick={onInstall}>{busy?<LoaderCircle className="update-spin" aria-hidden="true"/>:phase==='error'?<RotateCcw aria-hidden="true"/>:<Download aria-hidden="true"/>}{phase==='error'?'重新下载':busy?'处理中...':'立即更新'}</button>
      </div>
    </section>
  </div>
}

function normalizeUpdateError(cause:unknown){
  const message=cause instanceof Error?cause.message:typeof cause==='string'?cause:''
  if(/signature|签名|verify/i.test(message))return '更新包签名校验失败，已停止安装。'
  if(/save|保存/i.test(message))return '本地内容保存失败，已取消安装。'
  return '更新下载或安装失败，请检查网络后重试。'
}
