-- Site inspection checklists, part 1: the N/A verdict.
--
-- ALTER TYPE ... ADD VALUE cannot run in the same transaction as statements
-- that use the new value, so the enum change lives in its own migration (same
-- split as the material-request and BOQ pricing flows).
--
-- Why N/A: the paper forms offered only YES/NO, so an inapplicable check was
-- left blank — indistinguishable from one nobody performed. Making "does not
-- apply" a real answer is what lets the completion gate insist that every
-- remaining item was actually looked at.

alter type public.ops_qa_inspection_item_result add value if not exists 'na';
