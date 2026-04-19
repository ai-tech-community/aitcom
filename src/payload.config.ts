import { fileURLToPath } from "node:url";
import path from "path";
import { buildConfig } from "payload";
import { postgresAdapter } from "@payloadcms/db-postgres";
import { s3Storage } from "@payloadcms/storage-s3";
import { lexicalEditor } from "@payloadcms/richtext-lexical";
import sharp from "sharp";
import { resendAdapter } from "@payloadcms/email-resend";

import { Events } from "./collections/Events";
import { Speakers } from "./collections/Speakers";
import { Articles } from "./collections/Articles";
import { ForumThreads } from "./collections/ForumThreads";
import { ForumReplies } from "./collections/ForumReplies";
import { CommunityIdeas } from "./collections/CommunityIdeas";
import { IdeaVotes } from "./collections/IdeaVotes";
import { Challenges } from "./collections/Challenges";
import { CommunityRules } from "./collections/CommunityRules";
import { Pages } from "./collections/Pages";
import { Media } from "./collections/Media";
import { Sponsors } from "./collections/Sponsors";
import { SponsorApplications } from "./collections/SponsorApplications";
import { Jobs } from "./collections/Jobs";
import { RulesAcceptance } from "./collections/RulesAcceptance";
import { LaunchpadProjects } from "./collections/LaunchpadProjects";
import { Comments } from "./collections/Comments";
import { FeedPosts } from "./collections/FeedPosts";
import { FeedComments } from "./collections/FeedComments";
import { FeedLikes } from "./collections/FeedLikes";

function normalizePgSslMode(connectionString: string | undefined): string {
  if (!connectionString) {
    throw new Error("DATABASE_URL is required");
  }

  try {
    const url = new URL(connectionString);
    const sslmode = url.searchParams.get("sslmode");

    // pg currently treats these modes as verify-full; make that explicit.
    if (
      sslmode === "prefer" ||
      sslmode === "require" ||
      sslmode === "verify-ca"
    ) {
      url.searchParams.set("sslmode", "verify-full");
      url.searchParams.delete("uselibpqcompat");
    }

    return url.toString();
  } catch {
    return connectionString;
  }
}

const payloadDatabaseUrl = normalizePgSslMode(process.env.DATABASE_URL);

export default buildConfig({
  admin: {
    user: "users",
    meta: {
      titleSuffix: " - AIT Admin",
    },
  },
  collections: [
    Events,
    Speakers,
    Articles,
    ForumThreads,
    ForumReplies,
    CommunityIdeas,
    IdeaVotes,
    LaunchpadProjects,
    Comments,
    FeedPosts,
    FeedComments,
    FeedLikes,
    Challenges,
    Pages,
    Media,
    Sponsors,
    SponsorApplications,
    Jobs,
    RulesAcceptance,
    CommunityRules,
    {
      slug: "users",
      auth: {
        maxLoginAttempts: 5,
        lockTime: 15 * 60 * 1000, // 15 minutes
      },
      admin: { useAsTitle: "email" },
      fields: [
        { name: "name", type: "text" },
        {
          name: "role",
          type: "select",
          options: ["admin", "editor"],
          defaultValue: "editor",
        },
      ],
    },
  ],
  plugins: [
    s3Storage({
      collections: {
        media: {
          disablePayloadAccessControl: true,
          generateFileURL: ({ filename, prefix }) => {
            const bucket = process.env.S3_BUCKET;
            const region = process.env.S3_REGION ?? "eu-central-1";
            const parts = [prefix, filename].filter(Boolean).join("/");
            return `https://${bucket}.s3.${region}.amazonaws.com/${parts}`;
          },
        },
      },
      bucket: process.env.S3_BUCKET ?? "",
      acl: undefined,
      config: {
        credentials: {
          accessKeyId: process.env.S3_ACCESS_KEY_ID ?? "",
          secretAccessKey: process.env.S3_SECRET_ACCESS_KEY ?? "",
        },
        region: process.env.S3_REGION ?? "eu-central-1",
      },
    }),
  ],
  editor: lexicalEditor(),
  db: postgresAdapter({
    pool: { connectionString: payloadDatabaseUrl },
  }),
  localization: {
    locales: [
      { label: "English", code: "en" },
      { label: "Nederlands", code: "nl" },
    ],
    defaultLocale: "en",
    fallback: true,
  },
  typescript: {
    outputFile: path.resolve(
      path.dirname(fileURLToPath(import.meta.url)),
      "payload-types.ts",
    ),
  },
  secret:
    process.env.PAYLOAD_SECRET ??
    process.env.BETTER_AUTH_SECRET ??
    "dev-secret-change-me",
  sharp,
  email: resendAdapter({
    defaultFromAddress: "info@mailer.aitcommunity.org",
    defaultFromName: "AI Tech Community",
    apiKey: process.env.RESEND_API_KEY ?? "",
  }),
});
