const { Parser } = require("json2csv");
const db = require("../firebase");

/**
 * Submits a match scouting form for a specific team
 * @param {Object} req - Express request object
 * @param {Object} req.params - URL parameters
 * @param {string} req.params.teamNumber - Team number to submit for
 * @param {Object} req.body - Request body containing form data
 * @param {string} req.body.username - Scout's username
 * @param {string} req.body.matchNumber - Match number being scouted
 * @returns {Object} Response object
 * @returns {boolean} response.success - Whether submission was successful
 * @returns {string?} response.error - Error message if submission failed
 */
const submitMatchScoutForm = async (req, res) => {
  try {
    const { teamNumber } = req.params;
    const { username, matchNumber, ...formFields } = req.body;

    // Create PST timestamp
    const pstTimestamp = new Date().toLocaleString("en-US", {
      timeZone: "America/Los_Angeles",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hour12: true,
    });

    const teamDocRef = db.collection("matchscout").doc(teamNumber);
    const teamDoc = await teamDocRef.get();

    // Add timestamp to form data
    const formDataWithTimestamp = {
      ...formFields,
      submissionTimestamp: pstTimestamp,
    };

    if (teamDoc.exists) {
      await teamDocRef.update({
        [`match${matchNumber}`]: {
          [username]: formDataWithTimestamp,
        },
      });
    } else {
      const initialData = {
        [`match${matchNumber}`]: {
          [username]: formDataWithTimestamp,
        },
      };
      await teamDocRef.set(initialData);
    }

    res.status(200).json({ success: true });
  } catch (error) {
    console.error(error);
    res.status(500).json({ success: false, error: "Internal Server Error" });
  }
};

/**
 * Fetches all match scouting data
 * @param {Object} req - Express request object
 * @returns {Array<Object>} Array of match scout records
 * @returns {string} record.teamNumber - Team number
 * @returns {string} record.matchNumber - Match number
 * @returns {string} record.username - Scout's username
 * @returns {Object} record.[...formFields] - All form fields from the match
 */
const fetchMatchScoutData = async (req, res) => {
  try {
    const matchScoutCollection = db.collection("matchscout");
    const snapshot = await matchScoutCollection.get();
    const matchScoutData = [];

    snapshot.forEach((doc) => {
      const teamNumber = doc.id;
      const teamData = doc.data();

      Object.entries(teamData).forEach(([matchKey, matchData]) => {
        if (matchKey.startsWith('match')) {
          const matchNumber = matchKey.replace('match', '');
          const username = Object.keys(matchData)[0];
          const scoutData = matchData[username];

          matchScoutData.push({
            teamNumber,
            matchNumber,
            username,
            ...scoutData
          });
        }
      });
    });

    // Sort by team number and match number
    matchScoutData.sort((a, b) => {
      if (a.teamNumber !== b.teamNumber) {
        return a.teamNumber.localeCompare(b.teamNumber);
      }
      return parseInt(a.matchNumber) - parseInt(b.matchNumber);
    });

    res.status(200).json(matchScoutData);
  } catch (error) {
    console.error("Error fetching match scout data:", error);
    res.status(500).json({
      success: false,
      error: "Internal Server Error",
      details: error.message
    });
  }
};

/**
 * Fetches all pit scouting data
 * @param {Object} req - Express request object
 * @returns {Array<Object>} Array of pit scout records
 * @returns {string} record.teamNumber - Team number
 * @returns {string} record.username - Scout's username
 * @returns {Object} record.[...formFields] - All form fields from pit scout
 */
const fetchPitScoutData = async (req, res) => {
  try {
    const pitScoutCollection = db.collection("pitscout");

    const pitScoutDocuments = await pitScoutCollection.listDocuments();
    const pitScoutData = [];

    for (const document of pitScoutDocuments) {
      const documentRef = await document.get();
      const pitscout = documentRef.data().pitscout;

      for (const submissionKey in pitscout) {
        const submissionData = pitscout[submissionKey];
        const username = Object.keys(submissionData)[0];
        pitScoutData.push({
          teamNumber: document.id,
          submissionKey: submissionKey,
          ...submissionData[username],
          username: username,
        });
      }
    }

    res.json(pitScoutData);
  } catch (error) {
    console.error(error);
    res.status(500).json({ success: false, error: "Internal Server Error" });
  }
};

/**
 * Fetches all scouting instances (both match and pit)
 * @param {Object} req - Express request object
 * @returns {Object} Combined scouting data
 * @returns {Array<Object>} response.pitScoutInstances - All pit scout records
 * @returns {Array<Object>} response.matchScoutInstances - All match scout records
 */
const fetchAllScoutInstances = async (req, res) => {
  try {
    const pitScoutCollection = db.collection("pitscout");
    const matchScoutCollection = db.collection("matchscout");

    const pitScoutDocuments = await pitScoutCollection.listDocuments();
    const matchScoutDocuments = await matchScoutCollection.listDocuments();

    let pitScoutInstances = [];
    let matchScoutInstances = [];

    for (const document of pitScoutDocuments) {
      const documentRef = await document.get();
      const pitscout = documentRef.data().pitscout;

      for (const submissionKey in pitscout) {
        const submissionData = pitscout[submissionKey];
        const username = Object.keys(submissionData)[0];
        pitScoutInstances.push({
          teamNumber: document.id,
          submissionKey,
          ...submissionData[username],
          username,
          scoutType: "pitscout",
        });
      }
    }

    for (const document of matchScoutDocuments) {
      const documentRef = await document.get();
      const matchscout = documentRef.data();

      const autoscout = matchscout.autoscout || {};
      const teleopscout = matchscout.teleopscout || {};

      const checkScoutInstances = (scoutData, scoutType) => {
        for (const submissionKey in scoutData) {
          const submissionData = scoutData[submissionKey];
          const username = Object.keys(submissionData)[0];
          matchScoutInstances.push({
            teamNumber: document.id,
            submissionKey,
            ...submissionData[username],
            username,
            scoutType,
          });
        }
      };

      checkScoutInstances(autoscout, "autoscout");
      checkScoutInstances(teleopscout, "teleopscout");
    }

    res.json({ pitScoutInstances, matchScoutInstances });
  } catch (error) {
    console.error(error);
    res.status(500).json({ success: false, error: "Internal Server Error" });
  }
};

/**
 * Converts match scouting data to CSV format
 * @param {Object} req - Express request object
 * @returns {string} CSV formatted string of all match scout data
 * @returns {Object} error response if conversion fails
 * @returns {string} error.error - Error message
 * @returns {string} error.details - Detailed error information
 */
const convertMatchScoutToCSV = async (req, res) => {
  try {
    const snapshot = await db.collection("matchscout").get();
    const records = [];

    snapshot.forEach((doc) => {
      const teamNumber = doc.id;
      const teamData = doc.data();

      // Iterate through match data
      Object.entries(teamData).forEach(([matchKey, matchData]) => {
        if (matchKey.startsWith('match')) {
          const matchNumber = matchKey.replace('match', '');

          // Get the first (and only) username key
          const username = Object.keys(matchData)[0];
          const scoutData = matchData[username];

          // Create record with all fields
          records.push({
            teamNumber,
            matchNumber,
            username,
            submissionTimestamp: scoutData.submissionTimestamp || '',
            // Auto
            autoL1Scores: scoutData.autoL1Scores || 0,
            autoL2Scores: scoutData.autoL2Scores || 0,
            autoL3Scores: scoutData.autoL3Scores || 0,
            autoL4Scores: scoutData.autoL4Scores || 0,
            autoL1Attempts: scoutData.autoL1Attempts || 0,
            autoL2Attempts: scoutData.autoL2Attempts || 0,
            autoL3Attempts: scoutData.autoL3Attempts || 0,
            autoL4Attempts: scoutData.autoL4Attempts || 0,
            autoProcessorAlgaeScores: scoutData.autoProcessorAlgaeScores || 0,
            autoProcessorAlgaeAttempts: scoutData.autoProcessorAlgaeAttempts || 0,
            autoNetAlgaeScores: scoutData.autoNetAlgaeScores || 0,
            autoNetAlgaeAttempts: scoutData.autoNetAlgaeAttempts || 0,
            leftStartingZone: scoutData.leftStartingZone || 'No',
            // Teleop
            teleopL1Scores: scoutData.teleopL1Scores || 0,
            teleopL2Scores: scoutData.teleopL2Scores || 0,
            teleopL3Scores: scoutData.teleopL3Scores || 0,
            teleopL4Scores: scoutData.teleopL4Scores || 0,
            teleopL1Attempts: scoutData.teleopL1Attempts || 0,
            teleopL2Attempts: scoutData.teleopL2Attempts || 0,
            teleopL3Attempts: scoutData.teleopL3Attempts || 0,
            teleopL4Attempts: scoutData.teleopL4Attempts || 0,
            teleopProcessorAlgaeScores: scoutData.teleopProcessorAlgaeScores || 0,
            teleopProcessorAlgaeAttempts: scoutData.teleopProcessorAlgaeAttempts || 0,
            teleopNetAlgaeScores: scoutData.teleopNetAlgaeScores || 0,
            teleopNetAlgaeAttempts: scoutData.teleopNetAlgaeAttempts || 0,
            // Endgame
            climbLevel: scoutData.climbLevel || 'None',
            climbSuccess: scoutData.climbSuccess || 'No',
            climbAttemptTime: scoutData.climbAttemptTime || 'None',
            // Comments
            climbComments: scoutData.climbComments || '',
            robotSpeed: scoutData.robotSpeed || 'None',
            generalComments: scoutData.generalComments || ''
          });
        }
      });
    });

    if (records.length === 0) {
      return res.status(404).json({ error: "No scouting data found" });
    }

    const json2csvParser = new Parser();
    const csv = json2csvParser.parse(records);

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename=matchscout_data.csv');
    res.status(200).send(csv);

  } catch (error) {
    console.error("Error converting to CSV:", error);
    res.status(500).json({ error: "Failed to convert data to CSV", details: error.message });
  }
};

/**
 * Converts pit scouting data to CSV format
 * @param {Object} req - Express request object
 * @returns {string} CSV formatted string of all pit scout data
 * @returns {Object} error response if conversion fails
 * @returns {string} error.error - Error message
 * @returns {string} error.details - Detailed error information
 */
const convertPitScoutToCSV = async (req, res) => {
  try {
    const snapshot = await db.collection("pitscout").get();
    const records = [];

    snapshot.forEach((doc) => {
      const teamNumber = doc.id;
      const teamData = doc.data();

      if (teamData.pitscout) {
        Object.entries(teamData.pitscout).forEach(([submissionKey, submissionData]) => {
          const username = Object.keys(submissionData)[0];
          const scoutData = submissionData[username];

          records.push({
            teamNumber,
            username,
            submissionTimestamp: scoutData.submissionTimestamp || '',
            // Robot Specifications
            robotWeight: scoutData.robotWeight || '',
            frameSize: scoutData.frameSize || '',
            drivetrain: scoutData.drivetrain || '',

            // Auto Capabilities
            auto: scoutData.auto || '',
            // Auto Scoring Positions
            autoProcessor: scoutData.scoringPositions?.processor || false,
            autoNet: scoutData.scoringPositions?.net || false,
            autoL1: scoutData.scoringPositions?.l1 || false,
            autoL2: scoutData.scoringPositions?.l2 || false,
            autoL3: scoutData.scoringPositions?.l3 || false,
            autoL4: scoutData.scoringPositions?.l4 || false,
            autoNotesScored: scoutData.autoNotesScored || '',

            // Teleop Scoring Positions
            teleopProcessor: scoutData.scoringPositionsTeleop?.processorTeleop || false,
            teleopNet: scoutData.scoringPositionsTeleop?.netTeleop || false,
            teleopL1: scoutData.scoringPositionsTeleop?.l1Teleop || false,
            teleopL2: scoutData.scoringPositionsTeleop?.l2Teleop || false,
            teleopL3: scoutData.scoringPositionsTeleop?.l3Teleop || false,
            teleopL4: scoutData.scoringPositionsTeleop?.l4Teleop || false,

            // Teleop Capabilities
            estimatedCycleTime: scoutData.estimatedCycleTime || '',
            pickupFromFloor: scoutData.pickupFromFloor || '',

            // Climb
            climb: scoutData.climb || '',
            climbTime: scoutData.climbTime || '',

            // Additional Info
            additionalComments: scoutData.additionalComments || ''
          });
        });
      }
    });

    if (records.length === 0) {
      return res.status(404).json({ error: "No pit scout data found" });
    }

    const json2csvParser = new Parser({
      fields: [
        'teamNumber',
        'username',
        'submissionTimestamp',
        // Robot Specifications
        'robotWeight',
        'frameSize',
        'drivetrain',
        // Auto Capabilities
        'auto',
        'autoProcessor',
        'autoNet',
        'autoL1',
        'autoL2',
        'autoL3',
        'autoL4',
        'autoNotesScored',
        // Teleop Scoring Positions
        'teleopProcessor',
        'teleopNet',
        'teleopL1',
        'teleopL2',
        'teleopL3',
        'teleopL4',
        // Teleop Capabilities
        'estimatedCycleTime',
        'pickupFromFloor',
        // Climb
        'climb',
        'climbTime',
        // Additional Info
        'additionalComments'
      ]
    });

    const csv = json2csvParser.parse(records);

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename=pitscout_data.csv');
    res.status(200).send(csv);

  } catch (error) {
    console.error("Error converting to CSV:", error);
    res.status(500).json({ error: "Failed to convert data to CSV", details: error.message });
  }
};

/**
 * Submits a pit scouting form for a specific team
 * @param {Object} req - Express request object
 * @param {Object} req.params - URL parameters
 * @param {string} req.params.teamNumber - Team number to submit for
 * @param {Object} req.body - Request body containing form data
 * @param {string} req.body.username - Scout's username
 * @param {Object} req.body.scoringPositions - Auto scoring position capabilities
 * @param {Object} req.body.scoringPositionsTeleop - Teleop scoring position capabilities
 * @returns {Object} Response object
 * @returns {boolean} response.success - Whether submission was successful
 * @returns {string?} response.error - Error message if submission failed
 */
const submitPitScoutForm = async (req, res) => {
  try {
    const { teamNumber } = req.params;
    const { username, ...formFields } = req.body;

    // Create PST timestamp
    const pstTimestamp = new Date().toLocaleString("en-US", {
      timeZone: "America/Los_Angeles",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hour12: true,
    });

    const teamDocRef = db.collection("pitscout").doc(teamNumber);
    const teamDoc = await teamDocRef.get();

    // Add timestamp to form data
    const formDataWithTimestamp = {
      ...formFields,
      submissionTimestamp: pstTimestamp,
    };

    if (teamDoc.exists) {
      // Add new submission
      await teamDocRef.update({
        [`pitscout.submission${Date.now()}`]: {
          [username]: formDataWithTimestamp,
        },
      });
    } else {
      // Create new document with first submission
      const initialData = {
        pitscout: {
          [`submission${Date.now()}`]: {
            [username]: formDataWithTimestamp,
          },
        },
      };
      await teamDocRef.set(initialData);
    }

    res.status(200).json({ success: true });
  } catch (error) {
    console.error("Error submitting pit scout:", error);
    res.status(500).json({ success: false, error: "Internal Server Error" });
  }
};

module.exports = {
  submitMatchScoutForm,
  fetchMatchScoutData,
  fetchPitScoutData,
  fetchAllScoutInstances,
  convertMatchScoutToCSV,
  submitPitScoutForm,
  convertPitScoutToCSV
}