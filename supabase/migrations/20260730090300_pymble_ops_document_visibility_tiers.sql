-- Documents: five-tier visibility.
--
-- Old: company | restricted | private.
-- New: public | management | finance | md_restricted | private.
--
-- Mapping of existing rows:
--   company    -> public       (everyone could see it)
--   restricted -> management   (was leadership-only; management is the closest tier)
--   private    -> private      (unchanged)
--
-- A document is a GROUP (title/description/category/visibility); its
-- document_versions rows are the individual file attachments. Group
-- visibility governs every attachment — see canViewOpsDocumentVisibility.

alter type public.ops_document_visibility rename to ops_document_visibility_old;

create type public.ops_document_visibility as enum (
  'public',
  'management',
  'finance',
  'md_restricted',
  'private'
);

alter table public.documents
  alter column visibility drop default,
  alter column visibility type public.ops_document_visibility using (
    case visibility::text
      when 'company' then 'public'
      when 'restricted' then 'management'
      when 'private' then 'private'
      else 'management'
    end::public.ops_document_visibility
  ),
  alter column visibility set default 'private'::public.ops_document_visibility;

drop type public.ops_document_visibility_old;
