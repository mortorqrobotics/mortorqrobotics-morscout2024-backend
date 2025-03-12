const {
  convertMatchScoutToCSV,
  fetchAllMatchScoutButtonStatuses,
  fetchAllScoutInstances,
  fetchMatchScoutData,
  fetchPitScoutData,
  fetchMatchButtonStatus,
  submitMatchScoutForm,
  toggleMatchButtonStatus,
  submitPitScoutForm,
} = require("../controllers");
const { Router } = require("express")

const router = Router();

router.post("/matchscout/:teamNumber", submitMatchScoutForm);

// router.get("/matchscout/:teamNumber/:matchNumber/button", fetchMatchButtonStatus);

// router.post("/matchscout/:teamNumber/:matchNumber/button", toggleMatchButtonStatus);

router.get("/matchscout", fetchMatchScoutData);

router.get("/pitscout", fetchPitScoutData);

router.get("/all-scout-instances", fetchAllScoutInstances);

router.get("/matchscout/export/csv", convertMatchScoutToCSV);

router.get("/matchscout/match/:matchNumber/status", fetchAllMatchScoutButtonStatuses);

router.post("/submit-pitscout/:teamNumber", submitPitScoutForm);

module.exports = router;
