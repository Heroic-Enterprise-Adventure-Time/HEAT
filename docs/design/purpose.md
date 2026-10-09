# Purpose and focus

Why HEAT exists and what it concentrates on. Nothing described here is built yet unless it says so.

HEAT (Heroic Enterprise Adventure Time) is a browser game about running an adventuring business. It exists as a technical showcase: the game is deliberately simple, and the interest is in the data services behind it and the pipeline that delivers them.

Each item carries a status. **Decided** items are settled by the project owner. **Working assumption** items were proposed during design and not yet objected to: build on them, but expect them to be revisited. **Open** items are not yet answered.

- **Decided.** The focus is interesting data services and a polished delivery pipeline: cloud resources, authentication, containerized services, serverless functions, CI/CD.
- **Decided.** Interesting heroes and character customization are not the focus. Hard display problems, such as layered character animation and swappable gear, are simplified or left out.
- **Decided.** Web only, played in a browser. No desktop wrapper.
- **Decided.** The page is composed of Angular components, and Angular is the focus, because it is part of what is being shown. Buttons, menus, modals and layout are Angular. A canvas renderer such as PixiJS is allowed inside individual components, for example an animated sprite, but it is never the whole display.
- **Decided.** Game balance is not a goal. Content is placeholder.

A useful test for any feature: it should justify a service problem worth explaining. If it does not, it goes.
