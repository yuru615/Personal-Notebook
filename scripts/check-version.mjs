import {readFile} from 'node:fs/promises'

const packageJson=JSON.parse(await readFile(new URL('../package.json',import.meta.url),'utf8'))
const tauriConfig=JSON.parse(await readFile(new URL('../src-tauri/tauri.conf.json',import.meta.url),'utf8'))
const cargoToml=await readFile(new URL('../src-tauri/Cargo.toml',import.meta.url),'utf8')
const cargoVersion=cargoToml.match(/^version = "([^"]+)"$/m)?.[1]
const versions={package:packageJson.version,tauri:tauriConfig.version,cargo:cargoVersion}

if(!versions.package||versions.package!==versions.tauri||versions.package!==versions.cargo){
  throw new Error(`Client version mismatch: ${JSON.stringify(versions)}`)
}

process.stdout.write(`Client version ${versions.package}\n`)
