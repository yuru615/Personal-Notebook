import {render,screen,waitFor} from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import {describe,expect,it,vi} from 'vitest'
import type {ClientUpdateInfo,UpdateClient} from '../lib/updateClient'
import {UpdateProvider} from './updateContext'
import {useUpdate} from './updateContextValue'

const optionalUpdate:ClientUpdateInfo={currentVersion:'0.1.0',version:'0.1.1',notes:'修复与改进',pubDate:null,mandatory:false,minimumVersion:null,fileSize:100,sha256:'abc'}

function createClient(result:ClientUpdateInfo|null=optionalUpdate,overrides:Partial<UpdateClient>={}){
  return {currentVersion:vi.fn(async()=> '0.1.0'),check:vi.fn(async()=>result),download:vi.fn(async onProgress=>onProgress(100,100)),install:vi.fn(async()=>undefined),relaunch:vi.fn(async()=>undefined),...overrides} satisfies UpdateClient
}

function SaveRegistrar({flush}:{flush:()=>Promise<void>}){const update=useUpdate();return <button onClick={()=>update.registerBeforeInstall(flush)}>注册保存</button>}

describe('UpdateProvider',()=>{
  it('allows startup when the update service is unavailable',async()=>{
    const client=createClient(null,{check:vi.fn(async()=>{throw new Error('offline')})})
    render(<UpdateProvider client={client}><p>本地工作区</p></UpdateProvider>)
    expect(await screen.findByText('本地工作区')).toBeInTheDocument()
  })

  it('shows an optional update without blocking the application',async()=>{
    render(<UpdateProvider client={createClient()}><p>本地工作区</p></UpdateProvider>)
    expect(await screen.findByText('本地工作区')).toBeInTheDocument()
    expect(screen.getByRole('dialog',{name:'发现新版本 0.1.1'})).toBeInTheDocument()
  })

  it('blocks a mandatory update but permits offline use after a download failure',async()=>{
    const mandatory={...optionalUpdate,mandatory:true,minimumVersion:'0.1.1'}
    const client=createClient(mandatory,{download:vi.fn(async()=>{throw new Error('network')})})
    const user=userEvent.setup()
    render(<UpdateProvider client={client}><p>本地工作区</p></UpdateProvider>)
    expect(await screen.findByRole('dialog',{name:'发现新版本 0.1.1'})).toBeInTheDocument()
    expect(screen.queryByText('本地工作区')).not.toBeInTheDocument()
    await user.click(screen.getByRole('button',{name:'立即更新'}))
    await user.click(await screen.findByRole('button',{name:'本次离线使用'}))
    expect(await screen.findByText('本地工作区')).toBeInTheDocument()
  })

  it('flushes pending saves before install and relaunch',async()=>{
    const calls:string[]=[]
    const client=createClient(optionalUpdate,{download:vi.fn(async()=>{calls.push('download')}),install:vi.fn(async()=>{calls.push('install')}),relaunch:vi.fn(async()=>{calls.push('relaunch')})})
    const flush=vi.fn(async()=>{calls.push('flush')})
    const user=userEvent.setup()
    render(<UpdateProvider client={client}><SaveRegistrar flush={flush}/></UpdateProvider>)
    await user.click(await screen.findByRole('button',{name:'注册保存'}))
    await user.click(screen.getByRole('button',{name:'立即更新'}))
    await waitFor(()=>expect(client.relaunch).toHaveBeenCalled())
    expect(calls).toEqual(['download','flush','install','relaunch'])
  })
})
