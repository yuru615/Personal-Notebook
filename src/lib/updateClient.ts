import {Channel,invoke} from '@tauri-apps/api/core'
import {getVersion} from '@tauri-apps/api/app'
import {relaunch} from '@tauri-apps/plugin-process'
import {isDesktopRuntime} from './fileAccess'

export interface ClientUpdateInfo {
  currentVersion: string
  version: string
  notes: string
  pubDate: string | null
  mandatory: boolean
  minimumVersion: string | null
  fileSize: number | null
  sha256: string | null
}

type DownloadEvent=
  | {event:'started';data:{contentLength:number|null}}
  | {event:'progress';data:{chunkLength:number;downloaded:number}}
  | {event:'finished'}

export interface UpdateClient {
  currentVersion:()=>Promise<string>
  check:()=>Promise<ClientUpdateInfo|null>
  download:(onProgress:(downloaded:number,total:number|null)=>void)=>Promise<void>
  install:()=>Promise<void>
  relaunch:()=>Promise<void>
}

export function createTauriUpdateClient():UpdateClient|null {
  if(!isDesktopRuntime())return null
  return {
    currentVersion:getVersion,
    check:()=>invoke<ClientUpdateInfo|null>('check_client_update'),
    download:onProgress=>{
      let total:number|null=null
      const channel=new Channel<DownloadEvent>(message=>{
        if(message.event==='started'){
          total=message.data.contentLength
          onProgress(0,total)
        }else if(message.event==='progress'){
          onProgress(message.data.downloaded,total)
        }
      })
      return invoke('download_client_update',{onEvent:channel})
    },
    install:()=>invoke('install_client_update'),
    relaunch,
  }
}
