import { createEntry, Entry, EntryKind, Settings, defaults } from '../../../packages/shared/model';
import { repository, UserTask } from './bridge';
export class State extends EventTarget {
  records: Entry[] = [];
  settings: Settings = defaults;
  async load() { [this.records, this.settings] = await Promise.all([repository.all(), repository.settings()]); this.changed(); }
  list(kind: EntryKind) { return this.records.filter(r => r.kind === kind).sort((a, b) => b.createdAt.localeCompare(a.createdAt)); }
  async put(record: Entry,task?:UserTask) { const value = { ...record, updatedAt: new Date().toISOString() }; await repository.put(value,this.records.find(r=>r.id===record.id)?.updatedAt,task); this.records = [...this.records.filter(r => r.id !== value.id), value]; this.changed(); return value; }
  async add(kind: EntryKind, values: Partial<Entry>,task?:UserTask) { return this.put(createEntry(kind, values),task); }
  async remove(id: string,task?:UserTask) { await repository.remove(id,this.records.find(r=>r.id===id)?.updatedAt,task); this.records = this.records.filter(r => r.id !== id); this.changed(); }
  async preferences(settings: Settings,task?:UserTask,notify=true) { await repository.saveSettings(settings,task); this.settings = settings; if(notify)this.changed(); }
  async activity(title: string, body = '') { await this.add('activity', { title, body }); }
  changed() { this.dispatchEvent(new Event('change')); }
}
export const state = new State();
