/* LCARS MagicMirror : sample config.js
 * Goes in ~/MagicMirror/config/config.js
 *
 * Pages (chosen with MMM-pages, picked from the landing screen, no timed rotation):
 *   0 Home (landing tiles)  1 Month  2 Week  3 Agenda  4 Chores  5 House (Nest)
 *   Hidden pages: "photos" (slideshow) and "weather" (opened by tapping the weather chip).
 * Page membership is by `classes` ("page-landing", "page-month", ...); the MMM-pages block at the
 * bottom lists the pages. The legend (MMM-CalendarFilter) is tappable: it hides/shows calendars
 * on every view.
 *
 * BEFORE YOU START, search this file for "CHANGE ME":
 *   - calendar feed URLs and names (names must match custom.css and the legend below)
 *   - LAT / LON for the weather
 *   - ipWhitelist (add the address of any PC you want to reach the mirror from)
 *   - Nest camera names (or remove the House page if you have no Nest devices)
 * Secrets (calendar URLs with private tokens, Nest credentials) never belong in a public repo.
 */
/* ---- Messages for the info panel (core compliments module, block further down) ----
   The module mixes `anytime` with the list for the time of day (morning 3 AM to noon,
   afternoon noon to 5 PM, evening after 5 PM), so quotes and affirmations sit in `anytime`
   and show all day. A date key ("....-12-25") replaces the rest on that day.
   "\n" starts a new line (used for a quote's author). Keep each one short: the LCARS panel
   holds about three lines. */
const QUOTES = [
  "A journey of a thousand miles\nbegins with a single step. (Lao Tzu)",
  "It does not matter how slowly you go,\nas long as you do not stop. (Confucius)",
  "No act of kindness, no matter how small,\nis ever wasted. (Aesop)",
  "Well done is better than well said.\n(Benjamin Franklin)",
  "Keep your face to the sunshine\nand you cannot see a shadow. (Helen Keller)",
  "What we think, we become. (Buddha)",
  "Be curious, not judgmental.\n(Walt Whitman)",
  "The best way to cheer yourself up\nis to try to cheer somebody else up. (Mark Twain)",
  "Little by little, one travels far.\n(Proverb)",
  "Many hands make light work.\n(Proverb)",
  "Make it so.",
  "Engage!"
];
const AFFIRMATIONS = [
  "Today I will do my best, and my best is enough.",
  "I can do hard things.",
  "Mistakes help me learn and grow.",
  "I am kind to myself and to others.",
  "I am proud of how hard I try.",
  "Our family is a team.",
  "I choose to be brave today.",
  "Every day is a fresh start.",
  "I am loved, just as I am.",
  "I can ask for help when I need it."
];
const FAMILY_COMPLIMENTS = {
  morning: [
    "Good morning, crew!",
    "Rise and shine: today is going to be great.",
    "Have an awesome day at school!",
    "Breakfast first, then the galaxy.",
    "You look ready to take on the day."
  ],
  afternoon: [
    "Halfway there: nice work so far!",
    "Snack break? You've earned it.",
    "Someone in this house is really good at helping.",
    "Thanks for being such a good teammate.",
    "Keep going, you're doing great."
  ],
  evening: [
    "Good evening, crew. Mission accomplished.",
    "Thanks for a great day, everyone.",
    "Time to wind down and recharge.",
    "Proud of every one of you.",
    "Rest well: tomorrow is a new adventure."
  ]
};

const DEBUG_AGENDA = false;   // logs every event the Later panel sees to the browser console

// CHANGE ME: your location for the weather modules (decimal degrees). Example: New York City.
const LAT = 40.7128;
const LON = -74.0060;

let config = {
  address: "0.0.0.0",   // listen on the network; ipWhitelist below decides who may connect
  port: 8080,
  basePath: "/",
  kioskmode: true,       // Electron window fills the screen: no title bar, no window frame (the Pi runs MagicMirror via Electron)
  // CHANGE ME: localhost only. To reach the mirror from another PC, add its address in both forms,
  // e.g. "192.168.1.50", "::ffff:192.168.1.50", and give that PC a fixed address in your router.
  //ipWhitelist: ["127.0.0.1", "::ffff:127.0.0.1", "::1"],
  ipWhitelist: [] // uncomment to allow all IP addresses (anyone on the network can reach the mirror). Good for testing, but not secure. Use a whitelist in production.
  language: "en",
  locale: "en-US",
  timeFormat: 12,
  units: "imperial",

  modules: [
    /* ---- Data source: the core calendar module ----
       No `position`, so it draws nothing. It only fetches the feeds and
       passes events to CalendarExt3.
       Each `name` must match the data-calendar="..." values in custom.css. */
    {
      module: "calendar",
      classes: "cal-data",           // listed in MMM-pages `fixed` so it is never hidden
      config: {
        broadcastPastEvents: true,   // lets CX3 show earlier days in the month
        maximumEntries: 500,
        maximumNumberOfDays: 120,
        fetchInterval: 5 * 60 * 1000,
        // CHANGE ME: your iCal feeds. In Google Calendar: Settings > (calendar) > "Secret address
        // in iCal format". Treat these URLs like passwords: keep the real ones out of git.
        calendars: [
          { name: "Family", url: "https:://<CALENDAR PROVIDER>/YOUR_FAMILY_CALENDAR_ID/private-YOUR_TOKEN/basic.ics" },
          { name: "Parent1", url: "https://<CALENDAR PROVIDER>/YOUR_CALENDAR_ID/private-YOUR_TOKEN/basic.ics" },
          { name: "Parent2", url: "https://<CALENDAR PROVIDER>/YOUR_ID/YOUR_TOKEN/calendar.ics" },
          { name: "Kids", url: "https://<CALENDAR PROVIDER>/YOUR_KIDS_CALENDAR_ID/private-YOUR_TOKEN/basic.ics" }
        ]
      },

    /* ---- Landing screen (page 0, the home screen) ----
       One tile per page; a tap sends PAGE_SELECT <page> or SHOW_HIDDEN_PAGE <name>.
       Page numbers below must match the MMM-pages `modules` list at the bottom.
       Custom module in ~/MagicMirror/modules/MMM-Landing. Look: custom.css "LANDING". */
    {
      module: "MMM-Landing",
      position: "middle_center",     // custom.css overrides the position
      classes: "landing-home page-landing",
      config: {
        pageIndex: 0,
        tiles: [
          { label: "Month", page: 1, icon: "month", tone: "gold", tag: "Calendar" },
          { label: "Week", page: 2, icon: "week", tone: "sky", tag: "Calendar" },
          { label: "Agenda", page: 3, icon: "agenda", tone: "lilac", tag: "Today" },
          { label: "Chores", page: 4, icon: "chores", tone: "peach", tag: "Today" },
          { label: "Photos", hiddenPage: "photos", icon: "photos", tone: "periwinkle", tag: "Idle" },
          { label: "House", page: 5, icon: "house", tone: "tan", tag: "Climate" }
        ]
      }
    },

    /* ---- LCARS frame (every page) ----
       Elbows, bars, title and the info panel.
       Tap the header elbow (page name) to go home. `pages` follows the MMM-pages page order.
       Custom module in ~/MagicMirror/modules/MMM-LCARSFrame. In MMM-pages `fixed`. */
    {
      module: "MMM-LCARSFrame",
      position: "fullscreen_above",
      classes: "lcars-frame",
      config: {
        title: "Family Calendar",
        homePage: 0,
        panelLabel: ["Crew", "Log"],    // orange block left of the info panel (compliments)
        filterBar: true,                // the calendar filter pills fill the right end of the bottom bar
        pages: [
          { name: "Home", tag: "Landing", subtitle: "Display control \u00b7 select a screen" },
          { name: "Month", tag: "Calendar", subtitle: "Monthly overview" },
          { name: "Week", tag: "Calendar", subtitle: "Weekly schedule" },
          { name: "Agenda", tag: "Today", subtitle: "Today and coming up" },
          { name: "Chores", tag: "Family", subtitle: "Who does what today" },
          { name: "House", tag: "Systems", subtitle: "Climate \u00b7 doors \u00b7 cameras" }
        ],
        hiddenPages: {                  // labels for MMM-pages hidden pages (the frame listens for SHOW_HIDDEN_PAGE)
          weather: { name: "Weather", tag: "Forecast", subtitle: "7 days \u00b7 12 hours" }
        }
      }
    },

    /* ---- Month view ---- */
    {
      module: "MMM-CalendarExt3",
      classes: "page-month",
      position: "bottom_bar",      // custom.css overrides the position
      config: {
        mode: "month",
        instanceId: "basicCalendar",
        animationSpeed: 0,          // no fade when the filter pills redraw the view
        firstDayOfWeek: 0,         // 0 = Sunday, 1 = Monday
        maxEventLines: 3,
        fontSize: "18px",
        useSymbol: false,          // no calendar icon on pills; shapes are drawn in custom.css
        refreshInterval: 60 * 1000
      }
    },

    /* ---- Agenda page (artboard: Now / Later today / Coming up) ----
       MMM-CalendarExt3Agenda is one list module, so each artboard panel is its own
       instance, all fed by the same core calendar module above.
       Panel positions are set in custom.css by the `classes` names.
       eventFilter/eventTransformer property names (startDate, endDate, isFullday)
       are from the README example plus CX3 conventions: confirm in the console. */

    /* NOW: only the event running right now. No progress bar (needs a custom module). */
    {
      module: "MMM-CalendarExt3Agenda",
      position: "top_left",
      classes: "agenda-now page-agenda",
      config: {
        instanceId: "agendaNow",
        animationSpeed: 0,          // no fade when the filter pills redraw the view
        startDayIndex: 0,
        endDayIndex: 0,
        calendarSet: [],              // [] = all calendars
        showMiniMonthCalendar: false,
        useWeather: false,
        useSymbol: false,
        skipDuplicated: true,
        refreshInterval: 60 * 1000,
        eventFilter: (ev) => {
          const now = Date.now();
          return !ev.isFullday && Number(ev.startDate) <= now && Number(ev.endDate) > now;
        }
      }
    },

    /* LATER TODAY: rest of today, timed events that haven't started. */
    {
      module: "MMM-CalendarExt3Agenda",
      position: "top_left",
      classes: "agenda-later page-agenda",
      config: {
        instanceId: "agendaLater",
        animationSpeed: 0,          // no fade when the filter pills redraw the view
        startDayIndex: 0,
        endDayIndex: 0,
        calendarSet: [],
        showMiniMonthCalendar: false,
        useWeather: false,
        useSymbol: false,
        skipDuplicated: true,
        refreshInterval: 60 * 1000,
        eventFilter: (ev) => {
          if (DEBUG_AGENDA) console.log("CX3A later:", ev.title, new Date(Number(ev.startDate)).toString(), ev.isFullday);
          return !ev.isFullday && Number(ev.startDate) > Date.now();
        }
      }
    },

    /* COMING UP: tomorrow through the next 7 days, grouped by day. */
    {
      module: "MMM-CalendarExt3Agenda",
      position: "top_right",
      classes: "agenda-upcoming page-agenda",
      config: {
        instanceId: "agendaUpcoming",
        animationSpeed: 0,          // no fade when the filter pills redraw the view
        startDayIndex: 1,
        endDayIndex: 7,
        calendarSet: [],
        showMiniMonthCalendar: false,
        useWeather: false,
        useSymbol: false,
        skipDuplicated: true,
        showMultidayEventsOnce: true,
        onlyEventDays: 0,             // 0 = show empty days too; try 5 to list only days with events
        relativeNamedDayOptions: { style: "long" },  // "Tomorrow", then weekday names
        cellDateOptions: { weekday: "long", month: "short", day: "numeric" },  // "Friday, Nov 20"
        eventTimeOptions: { timeStyle: "short" },    // 5:30 PM
        refreshInterval: 60 * 1000
      }
    },

    /* ---- Week page: MMM-CalendarExt3Journal ----
       One week, Sunday to Saturday, 9 AM to 9 PM. custom.css pins it below the header band
       (left 48, top 144, 1824 x 864) and restyles it to the Journal artboard. */
    {
      module: "MMM-CalendarExt3Journal",
      position: "bottom_bar",
      classes: "page-week",
      config: {
        instanceId: "week",
        height: "864px",
        width: "100%",
        staticWeek: true,            // whole week, start to end (dayIndex/days ignored)
        firstDayOfWeek: 0,           // Sunday, same as the Month page
        staticTime: true,            // fixed window instead of "from now"
        beginHour: 9,                // 9 AM ...
        hourLength: 12,              // ... to 9 PM
        maxLaneThreshold: 3,         // up to 3 overlapping events side by side
        useSymbol: false,            // shapes come from custom.css
        hourIndexOptions: { hour: "numeric" },                 // "9 AM"
        dateHeaderOptions: { weekday: "short", day: "numeric" },  // "Sun 15"
        eventTimeOptions: { timeStyle: "short" },              // "5:30 PM"
        calendarSet: [],
        refreshInterval: 60 * 1000,
        animationSpeed: 0            // redraw without a fade (it redraws every time the page is shown)
      }
    },
    {
      module: "helloworld",
      position: "top_left",
      classes: "agenda-title week-title page-week",   // reuses the Agenda title styling
      config: { text: 'This <span class="accent">week</span>' }
    },

    /* ---- Page header: title, legend, clock ----
       helloworld renders its `text` as HTML. The legend is on the Month, Week and Agenda
       pages (it has all three page classes); the clock is in MMM-pages `fixed` (every page). */
    {
      module: "helloworld",
      position: "top_left",
      classes: "agenda-title page-agenda",
      config: { text: 'Agenda <span class="accent">today</span>' }
    },
    /* Legend (CHANGE ME: keep in step with the calendar names above): tap a pill to hide/show that calendar on every calendar view (pill dims).
       Custom module in ~/MagicMirror/modules/MMM-CalendarFilter. Keeps the "agenda-legend"
       class so the existing pill styling in custom.css still applies. */
    {
      module: "MMM-CalendarFilter",
      position: "top_center",
      classes: "agenda-legend page-landing page-agenda page-week page-month page-chores page-home",   // on Chores and House too: in LCARS it fills the bottom bar
      config: {
        calendars: [                  // pill order; names must match the calendar module above
          { name: "Family", cls: "family" },
          { name: "Parent1", cls: "parent1" },
          { name: "Parent2", cls: "parent2" },
          { name: "Kids", cls: "kids" }
        ],
        defaultHidden: [],            // e.g. ["Parent1"] to start with that calendar hidden
        resetAfter: 30 * 60 * 1000,   // 30 min after the last tap, go back to defaultHidden (0 = never)
        remember: true                // survive a browser reload
      }
    },
    {
      module: "clock",
      position: "top_right",
      classes: "header-clock",
      config: {
        displayType: "digital",
        timeFormat: 12,
        showPeriod: true,
        showPeriodUpper: true,
        showDate: true,
        dateFormat: "dddd, MMMM D",   // "Tuesday, November 17"
        showSunTimes: false,
        showWeek: false
      }
    },
    {
      module: "weather",
      position: "top_right",
      classes: "weather-current",
      config: {
        weatherProvider: "openmeteo",   // no API key needed
        type: "current",
        lat: LAT,                       // set at the top of this file
        lon: LON,
        units: "imperial",
        roundTemp: true,                  // 38°, not 38.1°
        appendLocationNameToHeader: false, // no city label over the chip
        showFeelsLike: false,
        showHumidity: "none",
        showSun: false,
        showWindDirection: false
      }
    },

    /* ---- Theme module (every page) ----
       Puts the class "theme-lcars" on <html>; every LCARS rule in custom.css hangs off that class.
       Only one theme here, so the button does nothing visible: it is kept because it applies the class.
       Custom module in ~/MagicMirror/modules/MMM-ThemeSwitcher. In MMM-pages `fixed`. */
    {
      module: "MMM-ThemeSwitcher",
      position: "bottom_right",
      classes: "theme-switcher",
      config: {
        themes: [
          { name: "lcars", label: "LCARS" }
        ],
        remember: false
      }
    },

    /* ---- Compliments (every page) ----
       MagicMirror's built-in compliments module (no install): one short message, changing every
       30 s, picked by time of day, shown in the outlined panel at the top of the LCARS frame.
       Position and colours are in custom.css ("INFO PANEL"). In MMM-pages `fixed`.
       Uses the quotes, affirmations and family messages defined at the top of this file
       instead of the module's defaults. */
    {
      module: "compliments",
      position: "bottom_left",
      classes: "info-panel",
      config: {
        classes: "compliment-text",   // replaces the module's "thin xlarge bright" text classes
        updateInterval: 30 * 1000,
        fadeSpeed: 1000,
        compliments: {
          anytime: [...QUOTES, ...AFFIRMATIONS],   // lists at the top of this file
          morning: FAMILY_COMPLIMENTS.morning,
          afternoon: FAMILY_COMPLIMENTS.afternoon,
          evening: FAMILY_COMPLIMENTS.evening,
          "....-01-01": ["Happy New Year!"],
          "....-12-25": ["Merry Christmas!"]
        }
      }
    },

    /* ---- Chores page (page 4): MMM-Chores by PierreGode ----
       Installed by hand in ~/MagicMirror/modules/MMM-Chores (git clone + npm install).
       Chores and people are managed in its admin page: http://<pi-address>:5003 (home network only;
       there is no login). Tap a chore on the mirror to tick it off (the row is the checkbox).
       IMPORTANT: settings saved in the admin page's cogwheel override this block (the module merges
       them in at startup), so set the same values there: group per user ON, show past ON,
       days to show 1, date format empty, level on mirror OFF, AI OFF.
       Why 1 day: ticking a repeating chore makes the module create its next copy straight away
       (tomorrow's, for a daily chore). With more than 1 day showing, that copy appears at once and
       looks like a duplicate. With 1 day it stays hidden until its day.
       Layout: one column per person (alphabetical, the module's order), CSS "CHORES" in custom.css. */
    {
      module: "MMM-Chores",
      position: "top_left",          // custom.css overrides the position
      classes: "chores-board page-chores",
      config: {
        updateInterval: 60 * 1000,
        adminPort: 5003,
        settings: "unlocked",        // admin cogwheel open; or a 6-digit PIN string to lock it
        groupPerUserOnMirror: true,  // one group (column) per person
        showLevelOnMirror: false,
        showCoinsOnMirror: false,
        showDays: 1,                 // today only (see above: more days shows the next copy of repeating chores)
        showPast: true,              // keep overdue, unfinished chores on the board
        dateFormatting: "",          // no date after the name (everything on the board is today or overdue)
        textMirrorSize: "medium",
        useAI: false,                // no OpenAI key: hide the AI features
        login: false
      }
    },
    {
      module: "helloworld",
      position: "top_left",
      classes: "agenda-title page-chores",   // page title, same styling as Week and Agenda
      config: { text: 'Chores <span class="accent">today</span>' }
    },

    /* ---- House page (page 5): Nest thermostat, doorbell and cameras ----
       Optional: no Nest? Remove the three modules below, the "House" tile in MMM-Landing, the
       House entry in MMM-LCARSFrame `pages`, and page 5 in MMM-pages.
       MMM-NestThermostat is a custom module in this repo (Google's official SDM API). Its
       credentials are NOT here: they are in ~/MagicMirror/config/nest.secrets.json on the Pi
       (chmod 600, never committed; format in MMM-NestThermostat/node_helper.js).
       Layout: custom.css "HOUSE PAGE". MMM-NestCameras (custom module, same credentials file) shows
       the doorbell and cameras: streams run only while this page is on screen. */
    {
      module: "MMM-NestThermostat",
      position: "top_left",          // custom.css overrides the position
      classes: "house-climate page-home",
      config: {
        secretsFile: "config/nest.secrets.json",
        updateInterval: 2 * 60 * 1000,   // read every 2 minutes; a tap on the page reads at once
        unit: "auto"                     // follows the thermostat's own °F / °C setting
      }
    },
    {
      module: "MMM-NestCameras",
      position: "top_left",          // custom.css overrides the position
      classes: "house-cameras page-home",
      config: {
        secretsFile: "config/nest.secrets.json",   // the same file as the thermostat
        order: ["Front Door", "Front Yard", "Backyard"],   // CHANGE ME: your Nest device names; first = the large feed
        streamMinutes: 5,              // feeds pause after 5 minutes without a tap; a tap resumes
        // Doorbell (needs "subscription" in the credentials file, see MMM-NestCameras/node_helper.js):
        housePage: 5,                  // the House page in MMM-pages below
        jumpOn: ["chime"],             // what brings the House page up; add "person" for a person at the door
        alertSeconds: 90,              // how long the "Doorbell · Front Door" banner stays
        returnAfter: 180               // back to the previous page after 3 minutes without a tap (0 = stay)
      }
    },
    {
      module: "helloworld",
      position: "top_left",
      classes: "agenda-title page-home",    // page title, same styling as the other pages
      config: { text: 'House <span class="accent">systems</span>' }
    },

    /* ---- Forecast page (hidden page "weather"): opened by tapping the weather chip ----
       Not in the page order or the dots. Shown with SHOW_HIDDEN_PAGE "weather"; LEAVE_HIDDEN_PAGE
       goes back. Built-in weather module, Open-Meteo (no key). Layout: custom.css "FORECAST PAGE". */
    {
      module: "helloworld",
      position: "top_left",
      classes: "agenda-title page-weather",
      config: { text: 'Weather <span class="accent">forecast</span>' }
    },
    {
      module: "weather",
      position: "top_left",          // custom.css overrides the position
      classes: "weather-daily page-weather",
      header: "Next 7 days",
      config: {
        weatherProvider: "openmeteo",
        type: "forecast",
        appendLocationNameToHeader: false,   // header is just "Next 7 days" / "Next 12 hours"
        lat: LAT,
        lon: LON,
        units: "imperial",
        maxNumberOfDays: 7,
        roundTemp: true,
        fade: false,
        showPrecipitationAmount: true,
        showUVIndex: true
      }
    },
    {
      module: "weather",
      position: "top_left",          // custom.css overrides the position
      classes: "weather-hourly page-weather",
      header: "Next 12 hours",
      config: {
        weatherProvider: "openmeteo",
        type: "hourly",
        appendLocationNameToHeader: false,   // header is just "Next 7 days" / "Next 12 hours"
        lat: LAT,
        lon: LON,
        units: "imperial",
        maxEntries: 12,
        roundTemp: true,
        fade: false,
        showPrecipitationAmount: true
      }
    },
    /* Tap handling for the weather chip (MMM-WeatherNav, custom module in this repo): a tap on
       .weather-current opens the forecast page; this module is shown only on that page, where it
       draws the Close button (and a second tap on the chip closes too). */
    {
      module: "MMM-WeatherNav",
      position: "bottom_right",       // custom.css pins the button left of the theme button
      classes: "weather-close page-weather",
      config: {
        hiddenPage: "weather"         // the name in MMM-pages hiddenPages below
      }
    },

    /* ---- Photos slideshow (hidden page, not in the rotation) ----
       Full-screen background layer, shown only on the hidden page "photos" (see MMM-pages below).
       Never put this class in `fixed`. imagePaths is relative to ~/MagicMirror; the example
       folder is a placeholder until the real photo folder is chosen.
       Test on the Pi (uses the MMM-Remote-Control entry below):
         curl http://localhost:8080/api/notification/SHOW_HIDDEN_PAGE/photos
       Back to the calendar: .../api/notification/HOME_PAGE */
    {
      module: "MMM-BackgroundSlideshow",
      position: "fullscreen_below",
      classes: "page-photos",
      config: {
        imagePaths: ["modules/MMM-BackgroundSlideshow/exampleImages/"],
        slideshowSpeed: 15 * 1000,   // ms per photo (confirm in the module README on the Pi)
        transitionImages: true,
        randomizeImageOrder: true,
        backgroundSize: "cover"
      }
    },

    /* ---- Remote control API (no position, draws nothing) ----
       Lets you send notifications from a terminal, e.g. for testing pages:
         curl http://localhost:8080/api/notification/SHOW_HIDDEN_PAGE/photos */
    {
      module: "MMM-Remote-Control",
      config: {
        secureEndpoints: false   // no API key needed: protected only by ipWhitelist above. To open it to more devices, set secureEndpoints: true and an apiKey (kept out of git)
      }
    },

    /* ---- Pages ----
       MMM-pages hides every module that is not on the current page or in `fixed`.
       Entries are classes set on the modules above. Page order = the page numbers used by
       MMM-Landing tiles and MMM-LCARSFrame `pages`.
       No timed rotation: every timing is 0, so pages only change on a tap. */
    {
      module: "MMM-pages",
      config: {
        modules: [
          ["page-landing"],     // page 0: Landing (home screen)
          ["page-month"],       // page 1: Month
          ["page-week"],        // page 2: Week (Journal)
          ["page-agenda"],      // page 3: Agenda
          ["page-chores"],      // page 4: Chores
          ["page-home"],        // page 5: House (Nest thermostat, doorbell, cameras)
        ],
        fixed: ["cal-data", "header-clock", "theme-switcher", "info-panel", "lcars-frame", "weather-current"],
        hiddenPages: {
          photos: ["page-photos"],   // idle slideshow; shown with SHOW_HIDDEN_PAGE "photos"
          // MMM-pages hides the `fixed` modules while a hidden page is up, so the forecast page lists
          // the ones it wants itself: LCARS frame, clock, compliments panel, theme button, weather chip.
          weather: ["page-weather", "lcars-frame", "header-clock", "info-panel", "theme-switcher", "weather-current"]
        },
        homePage: 0,                // HOME_PAGE goes to the landing screen
        // 0 everywhere = no automatic page changes. (rotationTime removed: deprecated, and it
        // overwrote timings.default.) rotationHomePageHidden defaults to 30 s, which would bounce
        // a hidden page (photos) back home, so it is 0 too.
        timings: { default: 0 },
        rotationHomePage: 0,
        rotationHomePageHidden: 0,
        rotationDelay: 60 * 1000,   // only used when rotation resumes after PAUSE_ROTATION
        animationTime: 800
      }
    }
  ]
};


/*************** DO NOT EDIT THE LINE BELOW ***************/
if (typeof module !== "undefined") { module.exports = config; }