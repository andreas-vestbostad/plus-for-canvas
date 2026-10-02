# Privacy

Plus for Canvas has no server and no analytics.

* **Reads:** your courses, course menus and content, planner items and course scores, through the Canvas API of the site you are on, with the login you already have.
* **Stores:** that data as a cache in `chrome.storage.local` in your browser. Settings, nicknames and added domains go in `chrome.storage.sync`, which your browser may sync between your own devices.
* **Sends:** nothing. The only network requests go to the Canvas site you are on.
* **Permissions:** `storage` for cache and settings; `activeTab` and `scripting` for the toolbar button; host access to `mitt.uib.no`, `*.instructure.com` and any Canvas domain you add yourself.

Clear everything from the settings page or by removing the extension.

Provided as is under the MIT license, without warranty.
