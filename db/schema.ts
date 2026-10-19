import { sql } from 'drizzle-orm';
import { sqliteTable, text, integer, uniqueIndex, index } from 'drizzle-orm/sqlite-core';

export const configuration = sqliteTable('configuration', {key:text('key').primaryKey(),value:text('value').notNull(),revision:integer('revision').notNull().default(0)});
export const outreach = sqliteTable('outreach', {
 id:text('id').primaryKey(),email:text('email').notNull(),domain:text('domain').notNull(),company:text('company').notNull(),
 packet:text('packet').notNull(),status:text('status').notNull().default('queued'),created_at:text('created_at').notNull(),
 profile_hash:text('profile_hash').notNull(),cv_hash:text('cv_hash').notNull(),reserved_at:text('reserved_at'),reservation_token:text('reservation_token'),
 sent_at:text('sent_at'),message_id:text('message_id'),thread_id:text('thread_id'),last_error:text('last_error'),run_id:text('run_id'),
}, t=>[
 uniqueIndex('one_active_company').on(t.domain).where(sql`${t.status} not in ('cancelled','rejected')`),
 uniqueIndex('one_active_contact').on(t.email).where(sql`${t.status} not in ('cancelled','rejected')`),
 uniqueIndex('reservation_token_unique').on(t.reservation_token),index('outreach_status').on(t.status),
]);
export const suppression=sqliteTable('suppression',{email:text('email').primaryKey(),reason:text('reason').notNull(),created_at:text('created_at').notNull()});
export const leads=sqliteTable('leads',{id:text('id').primaryKey(),domain:text('domain').notNull().unique(),company:text('company').notNull(),website:text('website').notNull(),status:text('status').notNull().default('discovered'),research:text('research').notNull().default('{}'),reason:text('reason'),updated_at:text('updated_at').notNull()});
export const runs=sqliteTable('runs',{id:text('id').primaryKey(),kind:text('kind').notNull(),status:text('status').notNull(),started_at:text('started_at').notNull(),heartbeat_at:text('heartbeat_at').notNull(),finished_at:text('finished_at'),report:text('report').notNull().default('{}')},t=>[uniqueIndex('one_running_research').on(t.status).where(sql`${t.status}='running'`)]);
export const events=sqliteTable('events',{id:integer('id').primaryKey({autoIncrement:true}),at:text('at').notNull(),kind:text('kind').notNull(),detail:text('detail').notNull()});

export const contactIndex=sqliteTable('contact_index',{
 email:text('email').primaryKey(),company_domain:text('company_domain').notNull(),company:text('company').notNull().default(''),
 name:text('name').notNull().default(''),role:text('role').notNull().default(''),location:text('location').notNull().default(''),
 created_at:text('created_at').notNull(),updated_at:text('updated_at').notNull(),
},t=>[index('contact_index_domain').on(t.company_domain)]);
export const contactSources=sqliteTable('contact_sources',{
 id:text('id').primaryKey(),email:text('email').notNull(),source_url:text('source_url'),kind:text('kind').notNull(),provider:text('provider').notNull(),
 fingerprint:text('fingerprint').notNull(),observed_at:text('observed_at').notNull(),evidence:text('evidence').notNull(),
},t=>[index('contact_sources_email').on(t.email)]);
export const sourceCollections=sqliteTable('source_collections',{
 id:text('id').primaryKey(),started_at:text('started_at').notNull(),finished_at:text('finished_at').notNull(),report:text('report').notNull(),
});
export const companyInventory=sqliteTable('company_inventory',{
 domain:text('domain').primaryKey(),name:text('name').notNull(),industry:text('industry').notNull().default(''),location:text('location').notNull().default(''),
 provider:text('provider').notNull(),source_url:text('source_url').notNull(),attribution:text('attribution').notNull().default(''),updated_at:text('updated_at').notNull(),
});
