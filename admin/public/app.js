import { displayAccessIdentity } from "./modules/access-identity.js";
import { setupCreateReleaseForm } from "./modules/release-registration-controller.js";
import { setupReleaseList } from "./modules/release-list-controller.js";

const releaseList = setupReleaseList();

void displayAccessIdentity();

setupCreateReleaseForm({
	onCreated: () => releaseList.load(),
});

releaseList.load();
