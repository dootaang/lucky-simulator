export * from './support.ts';
export * from './common.ts';
export * from './advanced.ts';
export * from './hunter.ts';
import { ModuleRegistry } from '@simbot/kernel'; import { commonModules } from './common.ts'; import { craftingModule,equipmentModule,questsModule,shopModule } from './advanced.ts'; import { hunterModule } from './hunter.ts';
export function createStandardRegistry(){const registry=new ModuleRegistry();for(const module of commonModules())registry.register(module);for(const module of [equipmentModule(),questsModule(),shopModule(),craftingModule(),hunterModule()])registry.register(module);return registry;}
