import { provideZoneChangeDetection } from "@angular/core";
import { bootstrapApplication } from "@angular/platform-browser";

import { AppComponent } from "./app/app.component";

// No NgModule anywhere: `<nex-grid>` is a standalone component, so it is
// imported by the component that uses it and nothing has to be declared.
bootstrapApplication(AppComponent, {
  providers: [provideZoneChangeDetection({ eventCoalescing: true })],
}).catch((error: unknown) => console.error(error));
