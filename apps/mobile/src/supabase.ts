import { createClient } from "@supabase/supabase-js";

export const supabase = createClient(
  "https://nkalcmrmuucbwsyrxoyr.supabase.co",
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5rYWxjbXJtdXVjYndzeXJ4b3lyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzgyMzYyMTUsImV4cCI6MjA5MzgxMjIxNX0.uW537-i_QO5sREe0BHukqXB7MjcWFe32aMWjENxvb9E"
);
