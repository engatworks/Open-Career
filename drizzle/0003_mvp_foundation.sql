CREATE TABLE mvp_acceptances (
  account_id TEXT PRIMARY KEY NOT NULL,
  terms_version TEXT NOT NULL,
  terms_hash TEXT NOT NULL,
  accepted_at TEXT NOT NULL,
  revoked_at TEXT
);
--> statement-breakpoint
CREATE TABLE mvp_grants (
  account_id TEXT NOT NULL,
  scope TEXT NOT NULL,
  granted_at TEXT NOT NULL,
  revoked_at TEXT,
  PRIMARY KEY(account_id, scope)
);
--> statement-breakpoint
CREATE TABLE mvp_applications (
  id TEXT PRIMARY KEY NOT NULL,
  account_id TEXT NOT NULL,
  company_domain TEXT NOT NULL,
  ats_job_id TEXT NOT NULL,
  vacancy_url TEXT NOT NULL,
  position_title TEXT NOT NULL,
  state TEXT NOT NULL DEFAULT 'prepared',
  cv_hash TEXT NOT NULL,
  evidence TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
--> statement-breakpoint
CREATE INDEX mvp_applications_owner_updated ON mvp_applications(account_id, updated_at);
--> statement-breakpoint
CREATE TABLE mvp_portal_accounts (
  id TEXT PRIMARY KEY NOT NULL,
  account_id TEXT NOT NULL,
  site_host TEXT NOT NULL,
  login_email TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE(account_id, site_host, login_email)
);
--> statement-breakpoint
CREATE INDEX mvp_portal_owner ON mvp_portal_accounts(account_id);
