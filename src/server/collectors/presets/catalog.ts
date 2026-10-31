import { eventPage } from "../collectors/event-page";
import { hackerNews, recognizeHackerNews } from "../collectors/hacker-news";
import {
  githubRepositories,
  recognizeGithubOrganization,
} from "../collectors/github-repositories";
import { CUSTOM_PAGE_PRESET_ID } from "@/lib/collectors/presets";
import { recognizeGreenhouseBoard } from "@/lib/job-boards/greenhouse";
import { recognizeWorkableBoard } from "@/lib/job-boards/workable";
import { recognizeLeverBoard } from "@/lib/job-boards/lever";
import { recognizeAshbyBoard } from "@/lib/job-boards/ashby";

import { recognizePersonioBoard } from "@/lib/job-boards/personio";
import { personioJobs } from "../collectors/personio-jobs";
import { feedItems } from "../collectors/feed-items";
import { jobBoard } from "../collectors/job-board";
import { pageList } from "../collectors/page-list";
import { type AnyPreset, definePreset } from "./preset";

const greenhouse = definePreset(jobBoard, {
  id: "greenhouse-board",
  group: "jobs",
  title: {
    en: "Greenhouse jobs",
    nl: "Greenhouse-vacatures",
    fr: "Offres Greenhouse",
  },
  summary: {
    en: "A company's published jobs on Greenhouse, with locations, departments and links.",
    nl: "De gepubliceerde vacatures van een bedrijf op Greenhouse, met locaties, afdelingen en links.",
    fr: "Les offres publiées d’une entreprise sur Greenhouse, avec lieux, services et liens.",
  },
  base: { board: "greenhouse" },
  ask: ["name"],
  hints: {
    name: {
      ...jobBoard.fieldHints.name,
      help: {
        en: "The company name in the board address: acme in https://boards.greenhouse.io/acme. You can also paste the full link in the sidebar.",
        nl: "De bedrijfsnaam in het adres: acme in https://boards.greenhouse.io/acme. Je kunt ook de volledige link in de zijbalk plakken.",
        fr: "Le nom de l’entreprise dans l’adresse : acme dans https://boards.greenhouse.io/acme. Vous pouvez aussi coller le lien complet dans la barre latérale.",
      },
    },
  },
  recognize: (url) => {
    const name = recognizeGreenhouseBoard(url);
    return name ? { name } : null;
  },
});

const ashby = definePreset(jobBoard, {
  id: "ashby-board",
  group: "jobs",
  title: { en: "Ashby jobs", nl: "Ashby-vacatures", fr: "Offres Ashby" },
  summary: {
    en: "A company's published jobs on Ashby, with locations, departments and links.",
    nl: "De gepubliceerde vacatures van een bedrijf op Ashby, met locaties, afdelingen en links.",
    fr: "Les offres publiées d’une entreprise sur Ashby, avec lieux, services et liens.",
  },
  base: { board: "ashby" },
  ask: ["name"],
  hints: {
    name: {
      ...jobBoard.fieldHints.name,
      placeholder: "Ashby",
      help: {
        en: "The company name in the board address: Ashby in https://jobs.ashbyhq.com/Ashby. Keep the same capital letters, or paste the full link in the sidebar.",
        nl: "De bedrijfsnaam in het adres: Ashby in https://jobs.ashbyhq.com/Ashby. Behoud de hoofdletters of plak de volledige link in de zijbalk.",
        fr: "Le nom de l’entreprise dans l’adresse : Ashby dans https://jobs.ashbyhq.com/Ashby. Conservez les majuscules ou collez le lien complet dans la barre latérale.",
      },
    },
  },
  recognize: (url) => {
    const name = recognizeAshbyBoard(url);
    return name ? { name } : null;
  },
});

const lever = definePreset(jobBoard, {
  id: "lever-board",
  group: "jobs",
  title: { en: "Lever jobs", nl: "Lever-vacatures", fr: "Offres Lever" },
  summary: {
    en: "Published jobs on Lever, with full descriptions and application links.",
    nl: "Gepubliceerde vacatures op Lever, met volledige omschrijvingen en sollicitatielinks.",
    fr: "Les offres publiées sur Lever, avec descriptions complètes et liens de candidature.",
  },
  base: { board: "lever" },
  ask: ["name"],
  hints: {
    name: {
      ...jobBoard.fieldHints.name,
      placeholder: "leverdemo",
      help: {
        en: "The company name in the address: leverdemo in https://jobs.lever.co/leverdemo. For an EU board, paste the full jobs.eu.lever.co link in the sidebar.",
        nl: "De bedrijfsnaam in het adres: leverdemo in https://jobs.lever.co/leverdemo. Plak voor een EU-vacaturesite de volledige jobs.eu.lever.co-link in de zijbalk.",
        fr: "Le nom de l’entreprise dans l’adresse : leverdemo dans https://jobs.lever.co/leverdemo. Pour un site européen, collez le lien jobs.eu.lever.co complet dans la barre latérale.",
      },
    },
  },
  recognize: (url) => {
    const match = recognizeLeverBoard(url);
    return match
      ? {
          name: match.name,
          ...(match.board === "lever-eu" ? { board: match.board } : {}),
        }
      : null;
  },
});

const workable = definePreset(jobBoard, {
  id: "workable-board",
  group: "jobs",
  title: {
    en: "Workable jobs",
    nl: "Workable-vacatures",
    fr: "Offres Workable",
  },
  summary: {
    en: "Published jobs on Workable, with full descriptions and application links.",
    nl: "Gepubliceerde vacatures op Workable, met volledige omschrijvingen en sollicitatielinks.",
    fr: "Les offres publiées sur Workable, avec descriptions complètes et liens de candidature.",
  },
  base: { board: "workable" },
  ask: ["name"],
  hints: {
    name: {
      ...jobBoard.fieldHints.name,
      placeholder: "careers",
      help: {
        en: "The company name in its board address: careers in https://apply.workable.com/careers/. You can also paste the company board link in the sidebar.",
        nl: "De bedrijfsnaam in het adres: careers in https://apply.workable.com/careers/. Je kunt ook de link naar de vacaturesite in de zijbalk plakken.",
        fr: "Le nom de l’entreprise dans l’adresse : careers dans https://apply.workable.com/careers/. Vous pouvez aussi coller le lien du site d’emploi dans la barre latérale.",
      },
    },
  },
  recognize: (url) => {
    const name = recognizeWorkableBoard(url);
    return name ? { name } : null;
  },
});

const personio = definePreset(personioJobs, {
  id: "personio-board",
  group: "jobs",
  title: personioJobs.title,
  summary: personioJobs.description,
  base: { language: "en" },
  ask: ["url", "language"],
  recognize: (url) => {
    const board = recognizePersonioBoard(url);
    return board ? { url: `${board.origin}/`, language: board.language } : null;
  },
});

const hn = definePreset(hackerNews, {
  id: "hacker-news-stories",
  group: "research",
  title: hackerNews.title,
  summary: hackerNews.description,
  base: {},
  ask: ["list", "limit"],
  recognize: recognizeHackerNews,
});
const github = definePreset(githubRepositories, {
  id: "github-org-repositories",
  group: "research",
  title: githubRepositories.title,
  summary: githubRepositories.description,
  base: {},
  ask: ["organization", "limit"],
  recognize: (url) => {
    const organization = recognizeGithubOrganization(url);
    return organization ? { organization } : null;
  },
});

const feed = definePreset(feedItems, {
  id: "feed",
  group: "research",
  title: {
    en: "News or blog feed",
    nl: "Nieuws- of blogfeed",
    fr: "Flux d’actualités ou de blog",
  },
  summary: {
    en: "The latest items of an RSS or Atom feed: title, link, date, author and a short summary.",
    nl: "De nieuwste items van een RSS- of Atom-feed: titel, link, datum, auteur en een korte samenvatting.",
    fr: "Les derniers éléments d’un flux RSS ou Atom : titre, lien, date, auteur et court résumé.",
  },
  base: {},
  ask: ["url"],
});

const pythonJobs = definePreset(pageList, {
  id: "python-jobs",
  group: "jobs",
  title: {
    en: "Python community jobs",
    nl: "Python-communityvacatures",
    fr: "Offres de la communauté Python",
  },
  summary: {
    en: "The public python.org job list, with titles, locations, source dates and links. Saved selectors are ready to use; if the list is empty, the site may have changed.",
    nl: "De openbare vacatures op python.org, met titels, locaties, brondatums en links. De selectors staan klaar; bij een lege lijst kan de site zijn gewijzigd.",
    fr: "Les offres publiques de python.org, avec titres, lieux, dates source et liens. Les sélecteurs sont prêts ; une liste vide peut signaler une modification du site.",
  },
  base: {
    url: "https://www.python.org/jobs/",
    itemSelector: ".list-recent-jobs > li",
    fields: [
      { name: "title", selector: ".listing-company-name a" },
      { name: "url", selector: ".listing-company-name a", attribute: "href" },
      { name: "location", selector: ".listing-location" },
      {
        name: "postedAt",
        selector: ".listing-posted time",
        attribute: "datetime",
      },
    ],
    maxPages: 1,
  },
  ask: ["maxPages"],
  hints: {
    maxPages: {
      label: { en: "Pages to read", nl: "Aantal pagina’s", fr: "Pages à lire" },
      help: {
        en: "The current Python job list fits on one page. Saved page settings are available below.",
        nl: "De huidige Python-vacaturelijst past op één pagina. De opgeslagen pagina-instellingen staan hieronder.",
        fr: "La liste actuelle tient sur une page. Les réglages enregistrés sont disponibles ci-dessous.",
      },
    },
  },
  recognize: (url) =>
    url.protocol === "https:" &&
    url.hostname === "www.python.org" &&
    !url.username &&
    !url.password &&
    !url.port &&
    /^\/jobs\/?$/.test(url.pathname) &&
    !url.search
      ? {}
      : null,
});

const events = definePreset(eventPage, {
  id: "event-page",
  group: "events",
  title: eventPage.title,
  summary: eventPage.description,
  base: {},
  ask: ["url"],
});

const customPage = definePreset(pageList, {
  id: CUSTOM_PAGE_PRESET_ID,
  group: "custom",
  title: {
    en: "Custom page",
    nl: "Eigen pagina",
    fr: "Page personnalisée",
  },
  summary: {
    en: "Any list on a web page, read with the CSS selectors you give. For sites we don't know yet.",
    nl: "Elke lijst op een webpagina, gelezen met de CSS-selectors die jij opgeeft. Voor sites die we nog niet kennen.",
    fr: "Toute liste sur une page web, lue avec les sélecteurs CSS que vous indiquez. Pour les sites que nous ne connaissons pas encore.",
  },
  base: {},
  ask: ["url", "itemSelector", "fields", "nextPageSelector", "maxPages"],
});

/**
 * Every preset, as typed data in code (Prototype; same approach as the
 * collector catalog, ADR-0040). Order is rail order within a group and
 * recognition order. Adding a preset = one entry here.
 */
const PRESETS: readonly AnyPreset[] = Object.freeze([
  greenhouse,
  ashby,
  lever,
  workable,
  personio,
  hn,
  github,
  feed,
  pythonJobs,
  events,
  customPage,
]);

export function allPresets(): readonly AnyPreset[] {
  return PRESETS;
}

export function getPreset(id: string): AnyPreset | undefined {
  return PRESETS.find((p) => p.id === id);
}
