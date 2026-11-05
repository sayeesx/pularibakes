import { IEpsoRepository } from './repository';
import { DemoRepository } from './demoRepository';
import { SupabaseRepository } from './supabaseRepository';
import { isSupabaseConfigured } from './supabaseClient';

let activeRepo: IEpsoRepository = isSupabaseConfigured
  ? new SupabaseRepository()
  : new DemoRepository();

export function getRepository(): IEpsoRepository {
  return activeRepo;
}

export function setDemoRepositoryMode(): void {
  activeRepo = new DemoRepository();
}

export function setSupabaseRepositoryMode(): void {
  activeRepo = new SupabaseRepository();
}

export { DemoRepository, SupabaseRepository };
export * from './repository';
export * from './supabaseClient';
