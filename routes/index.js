const {
  convertMatchScoutToCSV,
  fetchAllScoutInstances,
  fetchMatchScoutData,
  fetchPitScoutData,
  submitMatchScoutForm,
  convertPitScoutToCSV,
  submitPitScoutForm,
} = require("../controllers");
const { Router } = require("express")

const router = Router();

router.post("/matchscout/:teamNumber", submitMatchScoutForm);

router.get("/matchscout", fetchMatchScoutData);

router.get("/pitscout", fetchPitScoutData);

router.get("/all-scout-instances", fetchAllScoutInstances);

router.get("/matchscout/export/csv", convertMatchScoutToCSV);

router.get("/pitscout/export/csv", convertPitScoutToCSV);

router.post("/submit-pitscout/:teamNumber", submitPitScoutForm);

module.exports = router;
