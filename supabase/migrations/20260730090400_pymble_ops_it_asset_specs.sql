-- IT asset register: hardware specification fields, so the help desk knows
-- exactly what machine a user has before touching it (per the MD's request:
-- operating system, RAM, hard drive, processor; hostname added so remote
-- support can find the machine on the network).
--
-- Free-text on purpose — "16 GB DDR4", "512 GB NVMe SSD", "Windows 11 Pro
-- 23H2" carry more useful nuance than rigid numeric columns.

alter table public.it_assets
  add column if not exists operating_system text not null default '',
  add column if not exists processor text not null default '',
  add column if not exists ram text not null default '',
  add column if not exists storage text not null default '',
  add column if not exists hostname text not null default '';
