import { setupCreateReleaseForm } from "./modules/release-registration-controller.js";
import { setupReleaseList } from "./modules/release-list-controller.js";

const releaseList = setupReleaseList();

setupCreateReleaseForm({
	onCreated: () => releaseList.load(),
});

releaseList.load();
