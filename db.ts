
import { Dexie } from 'dexie';
import type { Table } from 'dexie';
import { Ticket, Person } from './types';

/**
 * Using the named import for Dexie to ensure that the class and its inherited members
 * like 'version' are correctly typed and recognized by TypeScript when extending the class.
 * This resolves potential typing ambiguities that can occur with default imports in certain environments.
 */
// Fix: Use the named export { Dexie } to ensure proper class inheritance and method availability in TypeScript.
export class TicketSplitDB extends Dexie {
  tickets!: Table<Ticket>;
  people!: Table<Person>;

  constructor() {
    super('TicketSplitDB');
    /**
     * Defining the database schema. The 'version' method is inherited from the Dexie base class.
     * This defines the versioning and the indexed fields for each table.
     */
    // Fix: Accessing 'version' method which is inherited from the base Dexie class.
    this.version(1).stores({
      tickets: 'id, date, merchant, createdAt',
      people: 'id, name'
    });
  }
}

export const db = new TicketSplitDB();
