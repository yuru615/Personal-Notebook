import {createContext,useContext} from 'react'
import type {ClientUpdateInfo} from '../lib/updateClient'

export type UpdatePhase='checking'|'idle'|'available'|'downloading'|'installing'|'error'

export interface UpdateContextValue {
  currentVersion:string
  info:ClientUpdateInfo|null
  phase:UpdatePhase
  progress:number
  message:string
  checkForUpdates:()=>Promise<void>
  installUpdate:()=>Promise<void>
  registerBeforeInstall:(handler:(()=>Promise<void>)|null)=>void
}

export const UpdateContext=createContext<UpdateContextValue|null>(null)

export function useOptionalUpdate(){return useContext(UpdateContext)}
export function useUpdate(){const value=useOptionalUpdate();if(!value)throw new Error('UpdateProvider is missing');return value}
