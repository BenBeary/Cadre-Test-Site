CADRE Alumni - Editing Guide
============================

This is a static HTML/CSS/JS site (no build step). Edit a file, save, refresh the
browser. To preview locally you must serve over HTTP (not file://) because the
JSON loader uses fetch(). Easiest options:
    - VS Code "Live Server" extension (right-click index.html -> "Open with Live Server")
    - Python: run "python -m http.server" in the project folder, then open http://localhost:8000


Project layout
--------------
/                              site root (index.html, about.html live here)
/Announcements-Blogs/     listing page + post templates
/css/                          stylesheets
/js/                           scripts (partials, blog loader, etc.)
/images/main-page/             site photography
/images/misc/                  logo, placeholders, social icon sprite
/json/blog-data.json           the single source of truth for blog posts


--------------------------------------------------------------------------------
ADDING A NEW BLOG POST
--------------------------------------------------------------------------------

A post is two things: an HTML file in /Announcements-Blogs/ and an entry
in /json/blog-data.json. The JSON entry is what makes the post appear on the
home page preview and the announcements & events listing page. If you skip the
JSON step the post still exists at its URL but no one will find it.

1. Pick the closest template in /Announcements-Blogs/ and copy it:
       template-basic-blog.html        text-only post
       template-blog-with-people.html  text post + Contributors sidebar
       template-youtube-video.html     text post with an embedded YouTube video
       template-event.html             same shape as basic-blog (kept separate
                                       so events can diverge visually later)

2. Rename the copy to something descriptive, e.g. "spring-mixer-recap.html".
   Keep it lowercase with hyphens; no spaces.

3. Edit the new file: change the <title> tag, the <h1>, the date/author meta,
   and the body paragraphs/figures.

4. Open /json/blog-data.json and add an entry to the appropriate array:

   "announcements": for news/updates
   "events":        for things happening on a specific date (or date range)

   Required fields:
     "href"      path from the repo root, e.g.
                   "Announcements-Blogs/spring-mixer-recap.html"
     "title"     what the listing card shows
     "date"      MM-DD-YYYY (used for sorting and the card date pill)
     "thumbnail" path to the card image, e.g. "images/misc/CAO-placeholder.png"

   Optional:
     "end_date"  MM-DD-YYYY - use this for multi-day events. The card will
                 render the date pill as a range, e.g. "May 21 - Jun 02".

   Example entry:

       {
           "href": "Announcements-Blogs/spring-mixer-recap.html",
           "title": "Spring Mixer Recap & Photos",
           "date": "04-19-2026",
           "thumbnail": "images/misc/CAO-placeholder.png"
       }

5. Save. Reload the listing page - the new post should appear, sorted newest
   first. If it doesn't show up, check the browser dev tools console: a typo
   in the JSON (missing comma, trailing comma) will break the whole loader.

Missing fields fall back to defaults defined at the top of
/js/blog-grabber.js (DEFAULT_POST). If you forget a thumbnail the placeholder
is shown; if you forget a title it renders as "Untitled Post"; if the date
is missing or malformed it falls back to 01-01-2026. These are escape hatches,
not a substitute for real data - always set the fields you can.


--------------------------------------------------------------------------------
EDITING THE HEADER OR FOOTER
--------------------------------------------------------------------------------

The header and footer are injected by JavaScript so we only have to edit them
in one place. Both live in /js/partials.js as template strings:

    HEADER_HTML   the top bar (logo, theme toggle, nav links)
    FOOTER_HTML   the bottom bar (logo, social icons)

Things to know:
    - {{root}} inside the template gets replaced with the path back to the
      repo root for the current page. Always prefix links/images with it so
      they work from both / and /Announcements-Blogs/.
    - The "active" nav link is highlighted based on <body data-page="...">.
      Pages currently use: home, about, events.
    - Don't put real page-specific content here. Page-specific stuff lives in
      that page's <main>.

To add a new top-level page (e.g. a "Members" page):
    1. Create the HTML file. Copy an existing page as a starting point.
    2. Set <body data-page="members" data-root="...">. Use "" for root-level
       pages and "../" for pages one folder deep.
    3. Add a nav link in partials.js HEADER_HTML with data-page="members".


--------------------------------------------------------------------------------
ADDING OR CHANGING A SOCIAL ICON
--------------------------------------------------------------------------------

All social icons come from one sprite file: /images/misc/social-icons.svg.
Each icon is a <symbol> with an id like "icon-instagram". To use one:

    <a href="https://..." class="social-icon" aria-label="Instagram">
        <svg aria-hidden="true">
            <use href="../images/misc/social-icons.svg#icon-instagram"/>
        </svg>
    </a>

Notes:
    - The href path is relative to the page using it. From the root use
      "images/misc/...", from /Announcements-Blogs/ use "../images/misc/...".
    - "currentColor" in the sprite means the icon color comes from CSS. The
      site uses --color-complimentary by default, --color-primary on hover.
      You almost never need to override this.
    - In partials.js (header/footer) we use {{root}} instead of a relative
      path so it works on every page.

To add a new social network (e.g. Bluesky):
    1. Find a 24x24 SVG of the logo (or an icon set you like).
    2. Open /images/misc/social-icons.svg and add another <symbol>:

           <symbol id="icon-bluesky" viewBox="0 0 24 24">
               <path fill="currentColor" d="..."/>
           </symbol>

       Make sure the viewBox matches the source SVG. fill="currentColor" is
       what makes it theme-aware.
    3. Reference it with <use href="...#icon-bluesky"/> wherever you want it.


--------------------------------------------------------------------------------
COLORS, FONTS, AND SPACING
--------------------------------------------------------------------------------

Site-wide design tokens live at the top of /css/style.css under :root for light
mode and [data-theme="dark"] for dark mode. The important colors:

    --color-primary        purple/blue. Links, h1/h2 text, primary hover.
    --color-complimentary  red/coral. Underlines, active nav, FAQ open border,
                           social icons by default.
    --color-accent         teal. Used sparingly.
    --color-fg / --color-bg / --color-surface / --color-muted / --color-border
        the neutral tones.

If you change a token value it propagates everywhere automatically. Don't
hardcode colors in components - reference the variables instead.

Spacing variables: --space-1 (0.5rem) through --space-5 (3rem). Use these
rather than magic pixel values so the rhythm stays consistent.


--------------------------------------------------------------------------------
DARK MODE
--------------------------------------------------------------------------------

Dark mode is the default. The chosen theme is stored in localStorage under the
key "theme" so once a visitor toggles it their choice sticks. The selection is
applied by a tiny inline script at the top of every <head> - copy it into any
new page you add or you'll get a flash of the wrong theme on load.


--------------------------------------------------------------------------------
THE BACKGROUND SQUARES
--------------------------------------------------------------------------------

The decorative squares in the side gutters are drawn by /js/bg-squares.js. They
only appear on viewports wider than 1200px (the centered content's max-width)
and re-roll on every page load. To enable them on a new page, add these two
divs at the top of <body> and include the script:

    <div class="bg-squares bg-squares-left" aria-hidden="true"></div>
    <div class="bg-squares bg-squares-right" aria-hidden="true"></div>
    ...
    <script src="js/bg-squares.js"></script>


--------------------------------------------------------------------------------
THE IMAGE MODAL (LIGHTBOX)
--------------------------------------------------------------------------------

Every <img> inside <main> is clickable site-wide - clicking opens a fullscreen
modal that lets visitors step through every image on that page with prev/next
arrows, arrow keys, or click. Close with the X, the ESC key, or clicking the
backdrop.

Exclusions (these never open the modal):
    - Blog listing cards (.news-card img)
    - Home preview mini-cards (.news-mini-card img)
    - Contributor profile photos (.contributor-photo img)
    - The site logo and decorative background squares

To opt a one-off image out, add class="no-modal" to the <img>.

Captions in the modal come from the nearest <figcaption>, falling back to the
image's alt text.

The system is in /js/image-modal.js. It runs automatically on every page that
includes the script - no setup needed when adding new images.


--------------------------------------------------------------------------------
COMMON GOTCHAS
--------------------------------------------------------------------------------

- Opening an .html file by double-clicking it loads it as file://, which means
  fetch() won't work and the blog cards won't appear. Serve over HTTP (see top
  of this file).

- JSON is strict: no trailing commas, no comments, double-quotes around all
  strings. If posts stop appearing after an edit, open the JSON in VS Code -
  it will underline the syntax error.

- Path prefixes:
    Root-level pages (index.html, about.html):   "images/..." / "css/..."
    /Announcements-Blogs/ pages:            "../images/..." / "../css/..."
  The data-root attribute on <body> ("" or "../") helps partials.js inject
  paths that work either way.

- When committing, do NOT commit the /.claude/ folder. The .gitignore already
  excludes it; don't override that.


--------------------------------------------------------------------------------
PUBLISHING (GITHUB PAGES)
--------------------------------------------------------------------------------

This repo is set up to be hosted on GitHub Pages. To publish updates:
    1. Commit and push to the main branch.
    2. In the GitHub repo settings -> Pages, make sure source is "Deploy from
       a branch" -> main / (root).
    3. The site updates automatically a minute or so after each push.

The repo must be public unless you have a paid GitHub plan.
