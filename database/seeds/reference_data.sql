-- CSUPAK reference data seed — snapshot from 2026-11-22
-- Source: read-only Supabase SQL Editor export provided by project maintainer.
-- Contains ONLY colleges, courses/programs, and semesters; no personal data.
-- Intended ONLY for a new, isolated database after the schema baseline is installed.
-- Do NOT execute against production or any database with existing reference rows.
-- Original IDs are preserved for consistent foreign-key relationships.
-- created_at is omitted and will use its table default (now()).

BEGIN;

-- Fail safely if any target table already has rows. No upserts or overwrites.
DO $seed_guard$
BEGIN
    IF EXISTS (SELECT 1 FROM public.colleges)
       OR EXISTS (SELECT 1 FROM public.courses)
       OR EXISTS (SELECT 1 FROM public.semesters) THEN
        RAISE EXCEPTION 'Reference seed requires empty colleges, courses, and semesters tables. Aborting.';
    END IF;
END
$seed_guard$;

INSERT INTO public.colleges (id, college_code, college_name) VALUES
    (1, 'CAA', 'COLLEGE OF AGRICULTURE AND AGRI-INDUSTRIES'),
    (2, 'CEGS', 'COLLEGE OF ENGINEERING AND GEOSCIENCES'),
    (3, 'CED', 'COLLEGE OF EDUCATION'),
    (4, 'CHASS', 'COLLEGE OF HUMANITIES AND SOCIAL SCIENCES'),
    (5, 'COFES', 'COLLEGE OF FORESTRY AND ENVIRONMENTAL SCIENCES'),
    (6, 'CCIS', 'COLLEGE OF COMPUTING AND INFORMATION SCIENCES'),
    (7, 'CMNS', 'COLLEGE OF MATHEMATICS AND NATURAL SCIENCES');

INSERT INTO public.courses (id, college_id, course_code, course_name) VALUES
    (1, 1, 'BSAGRI', 'Bachelor of Sciences in Agriculture'),
    (2, 1, 'BSFT', 'Bachelor of Science in Food Technology'),
    (3, 1, 'MSCROP', 'Master of Science in Crop Science'),
    (4, 2, 'BSABE', 'Bachelor of Science in Agricultural and Biosystems Engineering'),
    (5, 2, 'BSME', 'Bachelor of Science in Mining Engineering'),
    (6, 2, 'BSGE', 'Bachelor of Science in Geodetic Engineering'),
    (7, 2, 'BSECE', 'Bachelor of Science in Electronics Engineering'),
    (8, 2, 'BSCE', 'Bachelor of Science in Civil Engineering'),
    (9, 2, 'BSGEOLOGY', 'Bachelor of Science in Geology'),
    (10, 3, 'BEED', 'Bachelor of Elementary Education'),
    (11, 3, 'BSED-ENG', 'Bachelor of Secondary Education Major in English'),
    (12, 3, 'BSED-FIL', 'Bachelor of Secondary Education Major in Filipino'),
    (13, 3, 'BSED-MATH', 'Bachelor of Secondary Education Major in Mathematics'),
    (14, 3, 'BSED-SCI', 'Bachelor of Secondary Education Major in Science'),
    (15, 4, 'BSSW', 'Bachelor of Science in Social Work'),
    (16, 4, 'BASOC', 'Bachelor of Arts in Sociology'),
    (17, 4, 'BSPSYCH', 'Bachelor of Science in Psychology'),
    (18, 5, 'BSAF', 'Bachelor of Science in Agroforestry'),
    (19, 5, 'BSES', 'Bachelor of Science in Environmental Science'),
    (20, 5, 'BSF', 'Bachelor of Science in Forestry'),
    (21, 5, 'MEM', 'Master’s in Environmental Management'),
    (22, 6, 'BSCS', 'Bachelor of Science in Computer Science'),
    (23, 6, 'BSIS', 'Bachelor of Science in Information System'),
    (24, 6, 'BSIT', 'Bachelor of Science in Information Technology'),
    (25, 7, 'BSAM', 'Bachelor of Science in Applied Mathematics'),
    (26, 7, 'BSBIO', 'Bachelor of Science in Biology'),
    (27, 7, 'BSCHEM', 'Bachelor of Science in Chemistry'),
    (28, 7, 'BSMB', 'Bachelor of Science in Marine Biology'),
    (29, 7, 'BSMATH', 'Bachelor of Science in Mathematics'),
    (30, 7, 'BSPHYS', 'Bachelor of Science in Physics');

INSERT INTO public.semesters (id, name, start_date, end_date, is_active) VALUES
    (1, '2026-2027 1st Semester', DATE '2026-08-01', DATE '2026-12-31', TRUE);

-- Explicit identity IDs require the associated sequences to be synchronized.
SELECT pg_catalog.setval(pg_catalog.pg_get_serial_sequence('public.colleges', 'id'), (SELECT MAX(id) FROM public.colleges), TRUE);
SELECT pg_catalog.setval(pg_catalog.pg_get_serial_sequence('public.courses', 'id'), (SELECT MAX(id) FROM public.courses), TRUE);
SELECT pg_catalog.setval(pg_catalog.pg_get_serial_sequence('public.semesters', 'id'), (SELECT MAX(id) FROM public.semesters), TRUE);

-- Abort the transaction if any reference count differs from the source snapshot.
DO $seed_verify$
BEGIN
    IF (SELECT COUNT(*) FROM public.colleges) <> 7
       OR (SELECT COUNT(*) FROM public.courses) <> 30
       OR (SELECT COUNT(*) FROM public.semesters) <> 1 THEN
        RAISE EXCEPTION 'Reference seed count verification failed.';
    END IF;
END
$seed_verify$;

COMMIT;
