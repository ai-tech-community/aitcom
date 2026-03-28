-- Custom SQL migration file, put your code below! --
CREATE INDEX "notification_user_created_idx" ON "app"."notification" ("user_id","created_at");