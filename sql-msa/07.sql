-- تعديل النصوص للفصحى (7 من 7): فحص
select count(*) filter (where prosrc ~ '(لتشوف|عم ندوّر|عم يدوّر|انضاف|اللي دعيته|تقدر تشوف|تانية|بدو موافقتك|صار سالب|لحد ما)') as نصوص_عامية_باقية,
       count(*) filter (where prosrc like '%للاطلاع على%') as نصوص_فصحى_جديدة
from pg_proc where pronamespace = 'public'::regnamespace;
