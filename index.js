import express from "express";
import helmet from "helmet";
import dotenv from "dotenv";
import bodyParser from "body-parser";
import cors from "cors";
import path from "path";
import axios from "axios";
import fs from "fs";

// external imports
import cookieParser from "cookie-parser";
import Connection from "./database/db.js";
import multer from "multer";
import azure from "azure-storage";
//
import cron from "node-cron";
import moment from "moment";

// external imports
import dashboardRouter from "./routes/dashboard.js";
import eventsRouter from "./routes/events.js";
import activitiesRouter from "./routes/activities.js";
import tagsRouter from "./routes/tags.js";
import devicesRouter from "./routes/devices.js";
import usersRouter from "./routes/users.js";
import kidsRouter from "./routes/kids.js";
import fixedDepositRouter from "./routes/fixed-deposit.js";
import fixedDepositLogsRouter from "./routes/fixed-deposit-logs.js";
import loanRouter from "./routes/loan.js";
import loanLogsRouter from "./routes/loan-logs.js";
import helpRouter from "./routes/help.js";
import "./routes/client/cron-job.js";
import { EventsImage, commonImage } from "./storageFileEnums.js";
import { authSecurityHeader } from "./middlewares/middlewareAuth.js";
import {
  addFixedDepositLog,
  updateFixedDepositLog,
} from "./controller/fixedDepositController.js";

// model
import fixedDepositSchema from "./model/fixedDepositSchema.js";
import eventSchema from "./model/eventSchema.js";
// enums
import {
  ACTIVITY_IMAGE,
  ASCENDING_ORDER,
  FDCencelledType,
  FDType,
  PASSBOOK_IMAGE,
  TYPE_DAILY,
  activityDone,
  byBoostEvent,
  byEVENT,
  dateFormat,
  eventAutoAccept,
  eventPENDING,
  eventRUNNING,
  fdStatus_CANCELLED,
  fdStatus_MATURED,
  fdStatus_onGOING,
  is_InActive,
  is_active,
  is_credit,
  is_debit,
  uploadEventAll_E,
  uploadEventAll_S,
  uploadEvent_E,
  uploadEvent_R,
  uploadEvent_S,
} from "./contentId.js";
import {
  addActivityCronJob,
  forMonthlyActivities,
  forOneDayActivities,
  forWeeklyActivities,
  getActivitiesApprovalTrue,
} from "./controller/eventsController.js";
import activitySchema from "./model/activitySchema.js";
import {
  BC_Success,
  addPassBookFDAndBoost,
  addPassbookEvent,
  checkUserExists,
  getAllActiveEventsForCron,
  getAllDevicePushToken,
  getAllEventWithEmptyEndDates,
  getBudget3D_CmpltedTargetOnly,
  getBudgetDetailsFalse,
  getCountedActivities,
  getDeviceDetails,
  getEventDetails,
  getKidName,
  getMostRecentActivityWithEmptyEndDates,
  getPN,
  getParentName,
  getTotalBalance,
  getTotalBalanceWithCurrency,
  updateActivity,
  updateEventStatus,
  updateOrCreateKidBalance,
  updatePNStatus,
  updatePNStatusTrue,
} from "./helper_function.js";
import boostEventSchema from "./model/boostEventSchema.js";
import boostRecordsSchema from "./model/boostRecordsSchema.js";
import Jimp from "jimp";
import { fileURLToPath } from "url";
import { registerFont, createCanvas, loadImage } from "canvas";
import nodemailer from "nodemailer";
import { pushNotifications } from "./pushNotification.js";
import { title } from "process";
import { code400 } from "./responseCode.js";
import { budgetMail01, budgetMail02 } from "./HTMLContent.js";
import { setTimeout } from "timers/promises";
import morgan from "morgan";

// CLient Imports

import blogRoute from "./routes/client/blogroute.js";
import faqRoute from "./routes/client/faqroute.js";
import videoRoute from "./routes/client/videosroute.js";
import linkedinPostRoute from "./routes/client/linkedinpostroute.js";
import testimonialRoute from "./routes/client/testimonialroute.js";
import policyRoute from "./routes/client/policyroute.js";
import emailRoute from "./routes/client/emailroute.js";

//
// Define __dirname for ES modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const upload = multer({
  dest: "uploads/",
  limits: { fileSize: 50 * 1024 * 1024 }, // 50MB limit
});

dotenv.config();
const app = express();
// app.use(morgan('combined'));
const PORT = process.env.PORT || 8000;
app.use(
  helmet({
    crossOriginResourcePolicy: false,
  })
);
const corsOptions = {
  origin: true,
  methods: ["*"], // Allow all methods
  credentials: true,
};
// middleware
// we have use body parser here to see the output in console
app.use(bodyParser.json({ extended: true }));
// app.use(bodyParser.urlencoded({ extended: true }));
app.use(express.urlencoded({ extended: true, limit: "50mb" }));
// app.use(express.json());
app.use(express.json({ limit: "50mb" }));
app.use(cors(corsOptions));
app.use(cookieParser());
app.use(express.static("public"));

// // Cache middleware
// const cache = {};

// const cacheMiddleware = (req, res, next) => {
//   const key = req.originalUrl;
//   if (cache[key]) {
//     console.log(`Cache hit for ${key}`);
//     return res.json(cache[key]);
//   }
//   res.sendResponse = res.json;
//   res.json = (body) => {
//     cache[key] = body;
//     res.sendResponse(body);
//   };
//   next();
// };
// // Apply cache middleware to specific routes
// app.use("/api", cacheMiddleware);

app.get("/", async (request, response) => {
  response.send("Cookies cleared and APIs working.");
});

app.use("/api", dashboardRouter);
app.use("/api", eventsRouter);
app.use("/api", activitiesRouter);
app.use("/api", tagsRouter);
app.use("/api", devicesRouter);
app.use("/api", usersRouter);
app.use("/api", kidsRouter);
app.use("/api", fixedDepositRouter);
app.use("/api", loanRouter);
app.use("/api", loanLogsRouter);
app.use("/api", fixedDepositLogsRouter);
app.use("/api", helpRouter);

//
// client API's
app.use("/api/blogs", blogRoute);
app.use("/api/faq", faqRoute);
app.use("/api/video", videoRoute);
app.use("/api/linkedin", linkedinPostRoute);
app.use("/api/testimonial", testimonialRoute);
app.use("/api/policies", policyRoute);
app.use("/api/emails", emailRoute);

//
// mailer

let transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST,
  port: process.env.SMTP_PORT,
  secure: false,
  auth: {
    user: process.env.SMTP_MAIL,
    pass: process.env.SMTP_PASSWORD,
  },
});

// Uploading APIs
const storageAccountName = process.env.AZURE_STORAGE_ACCOUNT_NAME;
const storageAccountKey = process.env.AZURE_STORAGE_ACCOUNT_KEY;
// const containerName = commonImage; // Replace with your container name
const blobService = azure.createBlobService(
  storageAccountName,
  storageAccountKey
);

app.post(
  "/api/upload/common-profile",
  authSecurityHeader,
  upload.single("ps-img"),
  (req, res) => {
    try {
      const blobName = generateBlobName(req.file.originalname);
      const stream = fs.createReadStream(req.file.path);
      const streamLength = req.file.size;

      // Set the content type of the blob
      const options = {
        contentSettings: {
          contentType: req.file.mimetype,
        },
      };

      blobService.createBlockBlobFromStream(
        commonImage,
        blobName,
        stream,
        streamLength,
        options,
        (error, result, response) => {
          if (!error) {
            // Generate a SAS token with read permission
            const startDate = new Date();
            const expiryDate = new Date(startDate);
            expiryDate.setMinutes(startDate.getMinutes() + 30); // Set the expiration time to 30 minutes from now

            const sharedAccessPolicy = {
              AccessPolicy: {
                Permissions: azure.BlobUtilities.SharedAccessPermissions.READ,
                Start: startDate,
                Expiry: expiryDate,
              },
            };

            const sasToken = blobService.generateSharedAccessSignature(
              commonImage,
              blobName,
              sharedAccessPolicy
            );

            // Construct the URL with the SAS token
            const imageUrl = blobService.getUrl(
              commonImage,
              blobName
              // sasToken
            );
            return res.status(200).json({
              success: true,
              message: "File uploaded successfully",
              imageUrl,
            });
          } else {
            return res.status(500).json({
              success: false,
              message: "Failed to upload file",
              error: error.message,
            });
          }
        }
      );
    } catch (error) {
      return res.status(500).json({
        success: false,
        message: "Internal server error",
        error: error.message,
      });
    }
  }
);

app.post("/api/upload/events", upload.array("ps-img", 10), async (req, res) => {
  try {
    const files = req.files;

    const uploadPromises = files.map(async (file) => {
      const blobName = generateBlobName(file.originalname);
      const stream = fs.createReadStream(file.path);
      const streamLength = file.size;

      const options = {
        contentSettings: {
          contentType: file.mimetype,
        },
      };

      return new Promise((resolve, reject) => {
        blobService.createBlockBlobFromStream(
          EventsImage,
          blobName,
          stream,
          streamLength,
          options,
          (error, result, response) => {
            // Cleanup the temporary file after uploading
            fs.unlink(file.path, (unlinkError) => {
              if (unlinkError) {
                console.error(uploadEvent_E, unlinkError);
              }
            });

            if (!error) {
              const startDate = new Date();
              const expiryDate = new Date(startDate);
              expiryDate.setMinutes(startDate.getMinutes() + 30);

              const sharedAccessPolicy = {
                AccessPolicy: {
                  Permissions: azure.BlobUtilities.SharedAccessPermissions.READ,
                  Start: startDate,
                  Expiry: expiryDate,
                },
              };

              const sasToken = blobService.generateSharedAccessSignature(
                EventsImage,
                blobName,
                sharedAccessPolicy
              );

              const imageUrl = blobService.getUrl(
                EventsImage,
                blobName
                // sasToken // will expire
              );

              // Resolve with the modified response format
              resolve({
                success: true,
                message: uploadEvent_S,
                data: [
                  {
                    filename: file.originalname,
                    imageUrl,
                  },
                ],
              });
            } else {
              reject({
                success: false,
                message: uploadEvent_R,
                error: error.message,
                filename: file.originalname,
              });
            }
          }
        );
      });
    });

    const results = await Promise.all(uploadPromises);

    // Cleanup other files in the 'uploads' folder
    cleanupTemporaryFiles();

    // Combine the individual results into a single response
    const finalResponse = {
      success: true,
      message: uploadEventAll_S,
      data: results.flatMap((result) => result.data),
    };

    res.status(200).json(finalResponse);
  } catch (error) {
    res.status(500).json({
      success: false,
      message: uploadEventAll_E,
      error: error.message,
    });
  }
});

function generateBlobName(originalName) {
  const timestamp = new Date().getTime();
  return `${timestamp}_${originalName}`;
}

function cleanupTemporaryFiles() {
  const uploadFolder = "uploads";

  fs.readdir(uploadFolder, (err, files) => {
    if (err) {
      console.error("Error reading directory:", err);
      return;
    }

    files.forEach((file) => {
      const filePath = `${uploadFolder}/${file}`;
      fs.unlink(filePath, (unlinkError) => {
        if (unlinkError) {
          console.error("Error deleting temporary file:", unlinkError);
        }
      });
    });
  });
}

app.listen(PORT, () => {
  Connection();
  console.log(`connection is on :: >> ${PORT}`);
});

// cron job

// */2 * * * * // each two minutes
// 0 0 * * * // 12 am of each day
// "0 23 * * *" // at 11 PM every day

// cron job for FD
cron.schedule("*/4 * * * *", async () => {
  try {
    const depositsToMature = await fixedDepositSchema
      .find({ status: fdStatus_onGOING })
      .lean();

    for (const deposit of depositsToMature) {
      if (deposit.status === fdStatus_CANCELLED) {
        const totalBal = await getTotalBalanceWithCurrency(
          deposit.userId,
          deposit.kidId
        );

        await updateFixedDepositLog(deposit._id, {
          status: fdStatus_CANCELLED,
          total: deposit.total,
        });

        const passbookObject = {
          userId: deposit.userId,
          kidId: deposit.kidId,
          entryId: deposit._id,
          entryName: FDCencelledType,
          status: fdStatus_CANCELLED,
          remarks: "FD has been cancelled",
          balance_stars: 0,
          available_balance: totalBal.available_balance,
          entryType: is_credit,
        };

        await addPassBookFDAndBoost(passbookObject);
      } else if (deposit.status === fdStatus_onGOING) {
        // Check if subscription is active or over

        const today = moment().startOf("day");
        const depositDate = moment(deposit.end_at, dateFormat, true);

        if (depositDate.isValid() && depositDate.isSameOrBefore(today)) {
          const doneDeposit = await fixedDepositSchema
            .findByIdAndUpdate(
              deposit._id,
              { status: fdStatus_MATURED },
              { new: true }
            )
            .lean();

          if (doneDeposit) {
            const isTotalDone = await updateOrCreateKidBalance(
              doneDeposit.userId,
              doneDeposit.kidId,
              doneDeposit.total,
              is_credit
            );

            if (isTotalDone) {
              await updateFixedDepositLog(doneDeposit._id, {
                status: fdStatus_MATURED,
                total: doneDeposit.total,
              });

              const passbookObject = {
                userId: doneDeposit.userId,
                kidId: doneDeposit.kidId,
                entryId: doneDeposit._id,
                entryName: FDType,
                status: doneDeposit.status,
                remarks: "FD has been matured",
                balance_stars: doneDeposit.total,
                available_balance: isTotalDone.available_balance,
                entryType: is_credit,
              };

              await addPassBookFDAndBoost(passbookObject);
            }
          }
        }
      }
    }

    response.status(200).json({
      success: true,
      message: "Operation successful",
    });
  } catch (error) {
    response.status(500).json({
      success: false,
      error: "Internal Server Error",
    });
  }
});

// cron job for all events type
cron.schedule("0 2 * * *", async () => {
  try {
    const totalEvents = await eventSchema.find();
    const responses = [];

    for (const event of totalEvents) {
      if (event.status === 1 && event.is_auto_complete_event === true) {
        let result;
        switch (event.frequency) {
          case "D":
            result = await processDailyEvent(event);
            break;
          case "W":
            result = await processWeeklyEvent(event);
            break;
          case "M":
            result = await processMonthlyEvent(event);
            break;
          default:
            console.error(`Unsupported frequency: ${event.frequency}`);
            result = { success: false, error: "Unsupported frequency" };
        }
        responses.push(result);
      }
    }
  } catch (error) {
    console.error("Cron Job Error:", error);
  }
});

// const eventEndDate = moment(event.end_at, "MM/DD/YYYY"); // Adjust the date format
// console.log("Current Date:", currentDate.format(dateFormat));
// console.log("Event End Date:", eventEndDate.format(dateFormat));
// console.log("Comparison Result:", currentDate.isSameOrBefore(eventEndDate, 'day'));
// const upcomingActivitiesDate = moment(event.start_at, dateFormat).add(
//   1,
//   "day"
// );
const isEventAlive = async (event) => {
  const currentDate = moment();
  const formattedCurrentDate = currentDate.format(dateFormat);

  const existingActivities = await activitySchema
    .find({
      eventId: event._id,
      start_at: { $lte: formattedCurrentDate },
      status: is_active, // Assuming "is_active" is a variable or string
    })
    .lean();

  const responses = [];

  // console.log(existingActivities);
  // process.exit();

  for (const activityDetails of existingActivities) {
    const isTotalDone = await updateOrCreateKidBalance(
      activityDetails.userId,
      activityDetails.kidId,
      activityDetails.stars,
      activityDetails.reward_type
    );

    if (isTotalDone) {
      const passbookResponse = await addPassbookEvent(
        isTotalDone,
        event,
        activityDetails._id
      );

      responses.push(passbookResponse);
    }
  }

  if (responses.length > 0) {
    // If the loop completes and at least one activity met the condition, return responses
    return responses;
  } else {
    const newActivities = await activitySchema
      .find({
        eventId: event._id,
        start_at: formattedCurrentDate,
      })
      .lean();

    return { alive: newActivities.length > 0, status: event.status };
  }
};

async function processDailyEvent(event) {
  try {
    const isAliveData = await isEventAlive(event);

    return { success: true, message: "Daily task processed successfully" };
  } catch (error) {
    console.error("Error processing daily task:", error);
    return { success: false, error: "Error processing daily task" };
  }
}

async function processWeeklyEvent(event) {
  try {
    const isAliveData = await isEventAlive(event);

    return { success: true, message: "Weekly task processed successfully" };
  } catch (error) {
    console.error("Error processing Weekly task:", error);
    return { success: false, error: "Error processing Weekly task" };
  }
}
// changes...
async function processMonthlyEvent(event) {
  try {
    const isAliveData = await isEventAlive(event);

    return { success: true, message: "Monthly task processed successfully" };
  } catch (error) {
    console.error("Error processing Monthly task:", error);
    return { success: false, error: "Error processing Monthly task" };
  }
}

// check old activities and make status as pending...---->
cron.schedule("*/2 * * * *", async () => {
  try {
    const details = await eventSchema
      .find({
        is_auto_complete_event: false,
        status: is_active,
      })
      .lean();

    await Promise.all(
      details.map(async (event) => {
        const activities = await getActivitiesApprovalTrue(
          event._id,
          eventRUNNING,
          is_active,
          ASCENDING_ORDER
        );
        if (activities.length > 0) {
          // Use forEach instead of map since you don't need a new array
          activities.forEach(async (activity) => {
            const today = moment().startOf("day");
            const activityDate = moment(activity.start_at, dateFormat, true);

            // Check if the activity date is valid and before or equal to today
            // isSameOrBefore
            if (activityDate.isValid() && activityDate.isSameOrBefore(today)) {
              // Use findByIdAndUpdate without {} around _id
              await activitySchema.findByIdAndUpdate(activity._id, {
                requestApproval: eventPENDING,
              });
            }
          });
        }
      })
    );

    // Uncomment the next line if you need to log a message
    // console.log("Update successful");
  } catch (error) {
    // console.log(error);
    // console.error("Cron Job Error:", error.message);
    // Handle the error and log an appropriate message
  }
});

// ... (cron job for boost records)
cron.schedule("*/10 * * * *", async () => {
  try {
    const boostEvents = await boostEventSchema
      .find({ status: is_active })
      .lean();
    const responses = [];

    for (const boost of boostEvents) {
      let result;
      switch (boost.frequency) {
        case "":
          result = await processOneTimeBoost(boost);
          break;
        case "W":
          result = await processWeeklyBoost(boost);
          break;
        case "M":
          result = await processMonthlyBoost(boost);
          break;
        default:
          // console.error(`Unsupported frequency: ${boost.frequency}`);
          result = { success: false, error: "Unsupported frequency" };
      }
      responses.push(result);
    }

    // Log responses to the console
    // console.log({ success: true, responses });
  } catch (error) {
    // console.error("Error in /testing123 route:", error);
    // Log error to the console
    // console.error({ success: false, error: "Internal Server Error" });
  }
});

// app.get("/testing123", async (request, response) => {
//   try {
//     const boostEvents = await boostEventSchema.find({ status: is_active });
//     const responses = [];

//     for (const boost of boostEvents) {
//       let result;
//       switch (boost.frequency) {
//         case "":
//           result = await processOneTimeBoost(boost);
//           break;
//         case "W":
//           result = await processWeeklyBoost(boost);
//           break;
//         case "M":
//           result = await processMonthlyBoost(boost);
//           break;
//         default:
//           // console.error(`Unsupported frequency: ${boost.frequency}`);
//           result = { success: false, error: "Unsupported frequency" };
//       }
//       responses.push(result);
//     }

//     // Log responses to the console
//     // console.log({ success: true, responses });
//   } catch (error) {
//     // console.error("Error in /testing123 route:", error);
//     // Log error to the console
//     // console.error({ success: false, error: "Internal Server Error" });
//   }
// });

const createBoostRecord = async (data) => {
  try {
    const isSuccess = await boostRecordsSchema.create(data);
    return isSuccess;
  } catch (error) {
    console.error("Error creating boost record:", error);
    return false;
  }
};

const checkEventIsBoostedOrNot = async (data) => {
  try {
    const eventToUpdate = await eventSchema
      .findOne({ _id: data.eventId })
      .lean();

    if (eventToUpdate.boostEvent === true) {
      const startDate = moment(data.from, dateFormat);
      const endDate = moment(data.to, dateFormat);
      const existingActivities = await activitySchema
        .find({
          $and: [
            {
              $or: [
                { start_at: { $gte: data.from, $lte: data.to } },
                { end_at: { $gte: data.from, $lte: data.to } },
              ],
            },
            { eventId: data.eventId },
            { status: activityDone },
          ],
        })
        .lean();

      let totalStars = 0;
      existingActivities.forEach((activity) => {
        totalStars += activity.stars;
      });

      if (totalStars >= data.stars) {
        const boostRecords = {
          userId: data.userId,
          kidId: data.kidId,
          eventId: data.eventId,
          boostEventId: data._id,
          reward: data.reward,
        };
        const isCompletedBoostEntry = await createBoostRecord(boostRecords);
        if (isCompletedBoostEntry) {
          const isTotalDone = await updateOrCreateKidBalance(
            data.userId,
            data.kidId,
            data.reward,
            is_credit
          );
          if (isTotalDone) {
            const passbookData = {
              userId: isCompletedBoostEntry.userId,
              kidId: isCompletedBoostEntry.kidId,
              entryId: isCompletedBoostEntry._id,
              entryName: byBoostEvent,
              status: `BOOST TASK`,
              remarks: `BOOST TASK COMPLETED`,
              balance_stars: isCompletedBoostEntry.reward,
              available_balance: isTotalDone.available_balance || 0,
              entryType: is_credit,
            };
            await addPassBookFDAndBoost(passbookData);
            await eventSchema.findOneAndUpdate(
              { _id: data.eventId },
              { $set: { boostEvent: false } },
              { new: true, lean: true } // Added lean here
            );
            await boostEventSchema.findOneAndUpdate(
              { _id: data._id },
              { $set: { status: 2 } },
              { new: true, lean: true } // Added lean here
            );
          }
        }
      }

      const currentDate = moment();
      if (endDate.isBefore(currentDate, "day")) {
        const boostRecords = {
          userId: data.userId,
          kidId: data.kidId,
          eventId: data.eventId,
          boostEventId: data._id,
          reward: 0,
        };
        const isCompletedBoostEntry = await createBoostRecord(boostRecords);
        if (isCompletedBoostEntry) {
          const passbookData = {
            userId: isCompletedBoostEntry.userId,
            kidId: isCompletedBoostEntry.kidId,
            entryId: isCompletedBoostEntry._id,
            entryName: byBoostEvent,
            status: `BOOST TASK EXPIRED`,
            remarks: `BOOST TASK GOT EXPIRED`,
            balance_stars: isCompletedBoostEntry.reward,
            available_balance:
              (await getTotalBalance(
                isCompletedBoostEntry.userId,
                isCompletedBoostEntry.kidId
              )) || 0,
            entryType: is_credit,
          };
          await addPassBookFDAndBoost(passbookData);
          await eventSchema.findOneAndUpdate(
            { _id: data.eventId },
            { $set: { boostEvent: false } },
            { new: true }
          );
          await boostEventSchema.findOneAndUpdate(
            { _id: data._id },
            { $set: { status: 2 } },
            { new: true }
          );
        }
      }
    }
  } catch (error) {
    console.error("Error checking if task is boosted:", error);
    // Log error to the console
    console.error({
      success: false,
      error: "Error checking if task is boosted",
    });
    return false;
  }
};

async function processOneTimeBoost(boost) {
  try {
    await checkEventIsBoostedOrNot(boost);
    // Log success message to the console
    // console.log({
    //   success: true,
    //   message: "Activities processed successfully",
    // });
  } catch (error) {
    console.error("Error processing one-time boost:", error);
    // Log error to the console
    console.error({ success: false, error: "Error processing one-time boost" });
  }
}

async function processWeeklyBoost(boost) {
  try {
    const calRunningDate = moment().format(dateFormat);
    const calWeekendDate = moment(calRunningDate, dateFormat)
      .endOf("isoWeek")
      .isoWeekday(7)
      .format(dateFormat);

    if (calRunningDate === calWeekendDate) {
      await checkEventIsBoostedOrNot(boost);
    }

    // Log success message to the console
    // console.log({
    //   success: true,
    //   message: "Activities processed successfully",
    // });
  } catch (error) {
    // console.error("Error processing weekly boost:", error);
    // // Log error to the console
    // console.error({ success: false, error: "Error processing weekly boost" });
  }
}

async function processMonthlyBoost(boost) {
  try {
    const calRunningDate = moment().format(dateFormat);
    const calMonthEndDate = moment(calRunningDate, dateFormat)
      .endOf("month")
      .format(dateFormat);

    if (calRunningDate === calMonthEndDate) {
      await checkEventIsBoostedOrNot(boost);
    }

    // Log success message to the console
    // console.log({
    //   success: true,
    //   message: "Activities processed successfully",
    // });
  } catch (error) {
    console.error("Error processing monthly boost:", error);
    // Log error to the console
    console.error({ success: false, error: "Error processing monthly boost" });
  }
}

cron.schedule("0 2 * * *", async () => {
  try {
    const eventDetails = await getAllEventWithEmptyEndDates();

    const cronResponses = []; // Clear previous responses

    // Check if eventDetails is iterable before proceeding
    if (!eventDetails || !eventDetails[Symbol.iterator]) {
      cronResponses.push({ success: false, error: "Internal Server Error" });
      return;
    }

    for (const event of eventDetails) {
      let result;
      switch (event.frequency) {
        case "D":
          result = await processOneTimeActivitiesOfEmptyEndDate(event);
          break;
        case "W":
          result = await processWeeklyActivitiesOfEmptyEndDate(event);
          break;
        case "M":
          result = await processMonthlyActivitiesOfEmptyEndDate(event);
          break;
        default:
          console.error(`Unsupported frequency: ${boost.frequency}`);
          result = { success: false, error: "Unsupported frequency" };
      }
      cronResponses.push(result);
    }
  } catch (error) {
    console.error("Cron Job Error:", error.message);
  }
});

const processOneTimeActivitiesOfEmptyEndDate = async (events) => {
  try {
    const checkActivityExitOrNot = await getMostRecentActivityWithEmptyEndDates(
      events._id
    );

    let eventObject;

    if (checkActivityExitOrNot === null) {
      const startMoment = moment(events.start_at, dateFormat);
      eventObject = {
        startAt: startMoment.format(dateFormat),
        endAt: startMoment.format(dateFormat),
        ...events,
      };
    } else {
      const currentMomentDate = moment(); // Get the current date

      const startMoment = moment(checkActivityExitOrNot.end_at, dateFormat);

      // Check if startMoment is same or before currentMomentDate
      if (startMoment.isBefore(currentMomentDate, "day")) {
        // If true, execute the code below
        const endDate = startMoment.clone();

        eventObject = {
          startAt: endDate.add(1, "days").format(dateFormat),
          endAt: endDate.add(1, "days").format(dateFormat),
          ...events,
        };
      }
    }
    const activitiesCreated = await forOneDayActivities(eventObject);

    return activitiesCreated; // Return the result directly
  } catch (error) {
    // Handle the error or rethrow it if necessary
    throw new Error(error);
  }
};

const processWeeklyActivitiesOfEmptyEndDate = async (events) => {
  try {
    const checkActivityExitOrNot = await getMostRecentActivityWithEmptyEndDates(
      events._id
    );

    let eventObject;

    if (checkActivityExitOrNot === null) {
      const startMoment = moment(events.start_at, dateFormat);
      let calculatedEndDate = moment(events.start_at, dateFormat)
        .clone()
        .endOf("isoWeek")
        .isoWeekday(7);

      eventObject = {
        startAt: startMoment.format(dateFormat),
        endAt: calculatedEndDate.format(dateFormat),
        ...events,
      };
    } else {
      const currentMomentDate = moment(); // Get the current date
      const startMoment = moment(checkActivityExitOrNot.end_at, dateFormat);

      let calculatedEndDate = moment(startMoment, dateFormat)
        .clone()
        .endOf("isoWeek")
        .isoWeekday(7);

      const calculatedNextWeekDate = calculatedEndDate.add(1, "days");

      let calculatedEndDateNext = moment(calculatedNextWeekDate, dateFormat)
        .clone()
        .endOf("isoWeek")
        .isoWeekday(7);

      let calculatedStartDate = moment(calculatedNextWeekDate, dateFormat)
        .startOf("week")
        .add(1, "days");

      // Check if startMoment is same or before currentMomentDate
      if (startMoment.isBefore(currentMomentDate, "day")) {
        eventObject = {
          startAt: calculatedStartDate.format(dateFormat),
          endAt: calculatedEndDateNext.format(dateFormat),
          ...events,
        };
      }
    }

    const activitiesCreated = await forWeeklyActivities(eventObject);

    return activitiesCreated; // Return the result directly
  } catch (error) {
    // Handle the error or rethrow it if necessary
    throw new Error(error);
  }
};

const processMonthlyActivitiesOfEmptyEndDate = async (events) => {
  try {
    const checkActivityExitOrNot = await getMostRecentActivityWithEmptyEndDates(
      events._id
    );

    let eventObject;

    if (checkActivityExitOrNot === null) {
      const startMoment = moment(events.start_at, dateFormat);

      let calculatedEndDate = moment(startMoment, dateFormat).endOf("month");

      eventObject = {
        startAt: startMoment.format(dateFormat),
        endAt: calculatedEndDate.format(dateFormat),
        ...events,
      };
    } else {
      const currentMomentDate = moment(); // Get the current date
      const startMoment = moment(checkActivityExitOrNot.end_at, dateFormat);

      let calculatedEndDate = moment(startMoment, dateFormat).endOf("month");

      const calculatedNextWeekDate = calculatedEndDate.add(1, "days");

      let calculatedEndDateNext = moment(
        calculatedNextWeekDate,
        dateFormat
      ).endOf("month");

      let calculatedStartDate = moment(
        calculatedNextWeekDate,
        dateFormat
      ).startOf("month");

      // Check if startMoment is same or before currentMomentDate
      if (startMoment.isBefore(currentMomentDate, "day")) {
        eventObject = {
          startAt: calculatedStartDate.format(dateFormat),
          endAt: calculatedEndDateNext.format(dateFormat),
          ...events,
        };
      }
    }

    const activitiesCreated = await forMonthlyActivities(eventObject);

    return activitiesCreated; // Return the result directly
  } catch (error) {
    // Handle the error or rethrow it if necessary
    throw new Error(error);
  }
};

cron.schedule("0 1 * * *", async () => {
  try {
    const eventDetails = await getAllActiveEventsForCron();
    const cronResponses = []; // Clear previous responses

    // Check if eventDetails is iterable before proceeding
    if (!eventDetails || !eventDetails[Symbol.iterator]) {
      cronResponses.push({ success: false, error: "Internal Server Error" });
      return;
    }

    for (const event of eventDetails) {
      let result;
      switch (event.frequency) {
        case "D":
          result = await processOneTimeActivitiesOfEmptyEndDate(event);
          break;
        case "W":
          result = await processWeeklyActivitiesOfEmptyEndDate(event);
          break;
        case "M":
          result = await processMonthlyActivitiesOfEmptyEndDate(event);
          break;
        default:
          console.error(`Unsupported frequency: ${boost.frequency}`);
          result = { success: false, error: "Unsupported frequency" };
      }
      cronResponses.push(result);
    }
  } catch (error) {
    console.error("Cron Job Error:", error.message);
  }
});

app.get("/testing1234", async (request, response) => {
  try {
    const eventDetails = await getAllActiveEventsForCron();
    const cronResponses = []; // Clear previous responses
    // Check if eventDetails is iterable before proceeding
    if (!eventDetails || !eventDetails[Symbol.iterator]) {
      cronResponses.push({ success: false, error: "Internal Server Error" });
      return;
    }

    for (const event of eventDetails) {
      let result;
      switch (event.frequency) {
        case "D":
          result = await processOneTimeActivitiesOfEmptyEndDate(event);
          break;
        case "W":
          result = await processWeeklyActivitiesOfEmptyEndDate(event);
          break;
        case "M":
          result = await processMonthlyActivitiesOfEmptyEndDate(event);
          break;
        default:
          console.error(`Unsupported frequency: ${boost.frequency}`);
          result = { success: false, error: "Unsupported frequency" };
      }
      cronResponses.push(result);
    }
  } catch (error) {
    console.error("Cron Job Error:", error.message);
  }
});
cron.schedule("0 2 * * *", async () => {
  try {
    const eventDetails = await getBudget3D_CmpltedTargetOnly();
  } catch (error) {
    console.error("Cron Job Error:", error.message);
  }
});

// BUDGET CERTIFICATE
registerFont(path.join(__dirname, "fonts/nameFont.ttf"), {
  family: "NameFont",
});
registerFont(path.join(__dirname, "fonts/contentFont1.ttf"), {
  family: "ContentFont",
});

// Check if TYPE_LOCAL is true
const typeLocal = process.env.TYPE_LOCAL === "true";

// Schedule cron job if typeLocal is false
cron.schedule("* * * * *", async () => {
  if (typeLocal) {
    // console.log("TYPE_LOCAL is true. Cron job will not run.");
    return;
  }

  try {
    const details = await getBudgetDetailsFalse();
    const certificatePath = "uploads/certificate/certificate.png";

    for (const detail of details) {
      let name = (await getKidName(detail.kidId)).name || "";
      let parentName = await getParentName(detail.userId);
      name = name
        .split(" ")
        .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
        .join(" ");

      const goalName = detail.goal_name;
      const image = await Jimp.read(certificatePath);

      // Create canvas for custom font text rendering
      const canvas = createCanvas(image.bitmap.width, image.bitmap.height);
      const ctx = canvas.getContext("2d");

      // Define colors and font sizes
      const nameColor = "#40CFFF"; // Example color for the name
      const contentColor = "#ED1B24"; // Example color for the content
      const nameFontSize = 38; // Example font size for the name
      const contentFontSize = 28; // Example font size for the content

      // Set font and color for the name
      ctx.font = `${nameFontSize}px 'NameFont'`;
      ctx.fillStyle = nameColor;
      const nameWidth = ctx.measureText(name).width;
      const nameX = (image.bitmap.width - nameWidth) / 2;
      const nameY = image.bitmap.height / 2 - 10; // Adjusted Y position for name
      ctx.fillText(name, nameX, nameY);

      // Set font and color for the content
      ctx.font = `${contentFontSize}px 'ContentFont'`;
      ctx.fillStyle = contentColor;
      const content = `For completing the budget goal Named "${goalName}" consisting of "${detail.achieved}" Stars.`;

      // Define padding and max width for content wrapping
      const padding = 60; // Distance from the vertical edges
      const maxWidth = image.bitmap.width - 2 * padding;
      let contentY = nameY + 80; // Adjusted Y position for content

      // Draw content with wrapping and centering
      const words = content.split(" ");
      let line = "";
      const lineHeight = contentFontSize * 1.2; // Adjust line height
      for (let n = 0; n < words.length; n++) {
        const testLine = line + words[n] + " ";
        const testWidth = ctx.measureText(testLine).width;
        if (testWidth > maxWidth && n > 0) {
          const lineX = (image.bitmap.width - ctx.measureText(line).width) / 2;
          ctx.fillText(line, lineX, contentY);
          line = words[n] + " ";
          contentY += lineHeight;
        } else {
          line = testLine;
        }
      }
      const lineX = (image.bitmap.width - ctx.measureText(line).width) / 2;
      ctx.fillText(line, lineX, contentY);

      // Merge canvas back to Jimp image
      const canvasImage = await Jimp.read(canvas.toBuffer());
      image.composite(canvasImage, 0, 0);

      // Save the new image
      const outputFilePath = "uploads/certificate/certificate_sent.png";
      await image.writeAsync(outputFilePath);
      const success = await BC_Success(detail._id);
      if (success) {
        const userEmail = (await checkUserExists(detail.userId)).email;

        const mailOptions = {
          from: process.env.SMTP_MAIL,
          to: userEmail,
          subject: budgetMail01,
          html: `<html>
<body>
Hi <b>${parentName}</b>,
<br/>
<p>We are so proud of ${name}!</p> ${budgetMail02}`,
          attachments: [
            {
              filename: "certificate.png",
              path: outputFilePath,
            },
          ],
        };

        transporter.sendMail(mailOptions, async function (error, info) {
          if (error) {
            reject(error);
          }
        });
      }
    }
  } catch (error) {
    console.error("Cron Job Error:", error.message);
  }
});

//
// push notification
// testing
app.post("/send-message", async (request, response) => {
  try {
    const { userId, title, body } = request.body;

    if (!userId || !title || !body) {
      return response.status(400).json({
        errorCode: code400,
        success: false,
        error: "All fields (userId, title and body) are required.",
      });
    }

    const result = await getDeviceDetails(userId);

    if (result === null) {
      return response.status(400).json({
        errorCode: code400,
        success: false,
        error: "Device not found sorry",
      });
    }

    const data = {
      title,
      body,
      token: result.push_token,
    };
    const res = await pushNotifications(data);
    if (res) {
      return response.status(200).json({
        success: true,
        message: "Message sent successfully",
      });
    }
  } catch (error) {
    response.status(400).json({
      status: code400,
      error: error.message,
    });
  }
});
// testing
app.post("/send-notification", async (request, response) => {
  try {

    await updatePNStatusTrue();
    
    // Fetch notification list
    const PNList = await getPN();
  
    let notificationsSent = 0;
    for (const list of PNList) {
      const { title, message: body, to, on, _id, dateWithTime } = list;

      const dateString = new Date(dateWithTime);
      const currentTime = new Date();

      if (!(dateString instanceof Date) || isNaN(dateString.getTime())) {
          console.error('Invalid Date object');
          process.exit(1);
      }
      const notificationTime = moment(dateString.toISOString()).format('YYYY-MM-DDTHH:mm:ss.SSS[Z]');
      const convertedCurrentTime = moment(currentTime.toISOString()).format('YYYY-MM-DDTHH:mm:ss.SSS[Z]');

      // console.log("current time ", convertedCurrentTime);
      // console.log("notification time ", notificationTime);
      // console.log(convertedCurrentTime >= notificationTime)
      
      
      // process.exit();
      
      if (convertedCurrentTime >= notificationTime) {

        let devices;

        if (to === "") {
          // If 'to' field is empty, get all device push tokens
          devices = await getAllDevicePushToken();
          
        } else {
          // If 'to' field is not empty, split by comma and get device details for each user ID
          const userIds = to.split(",").filter((id) => id);
          devices = await Promise.all(userIds.map(getDeviceDetails));
        }

        
        devices = devices.filter(
          (device) => device !== null && device !== undefined
        );
        

        // Check if devices are available
        if (!devices || devices.length === 0) {
          // console.log(`No devices found for notification: ${title}`);
          continue; // Continue to the next notification if no devices are found
        }
        // Send notifications to all relevant devices
        for (const device of devices) {
          notificationsSent++;
          const data = {
            title,
            body,
            token: device.push_token,
          };
          const res = await pushNotifications(data);
          if (res) {
            await updatePNStatus(_id);
            // console.log(
            //   `Notification sent successfully to token ${device.push_token}`
            // );
          }
        }
      }
    }

    // Respond with the number of notifications sent
    return response.status(200).json({
      success: true,
      message: `${notificationsSent} notifications sent successfully`,
    });
  } catch (error) {
    console.log(error);
    response.status(400).json({
      status: 400,
      error: error.message,
    });
  }
});

cron.schedule("*/10 * * * *", async () => {
  try {

    await updatePNStatusTrue();
    // Fetch notification list
    const PNList = await getPN();
    let notificationsSent = 0;
    for (const list of PNList) {
      const { title, message: body, to, on, _id, dateWithTime } = list;

      const dateString = new Date(dateWithTime);
      const currentTime = new Date();

      if (!(dateString instanceof Date) || isNaN(dateString.getTime())) {
          console.error('Invalid Date object');
          process.exit(1);
      }
      const notificationTime = moment(dateString.toISOString()).format('YYYY-MM-DDTHH:mm:ss.SSS[Z]');
      const convertedCurrentTime = moment(currentTime.toISOString()).format('YYYY-MM-DDTHH:mm:ss.SSS[Z]');

      // console.log("current time ", convertedCurrentTime);
      // console.log("notification time ", notificationTime);
      
      
      // process.exit();
      
      if (convertedCurrentTime >= notificationTime) {

        let devices;

        if (to === "") {
          // If 'to' field is empty, get all device push tokens
          devices = await getAllDevicePushToken();
          
        } else {
          // If 'to' field is not empty, split by comma and get device details for each user ID
          const userIds = to.split(",").filter((id) => id);
          devices = await Promise.all(userIds.map(getDeviceDetails));
        }

        
        devices = devices.filter(
          (device) => device !== null && device !== undefined
        );
        

        // Check if devices are available
        if (!devices || devices.length === 0) {
          // console.log(`No devices found for notification: ${title}`);
          continue; // Continue to the next notification if no devices are found
        }

        // Send notifications to all relevant devices
        for (const device of devices) {
          const data = {
            title,
            body,
            token: device.push_token,
          };
          const res = await pushNotifications(data);
          if (res) {
            await updatePNStatus(_id);
            // console.log(
            //   `Notification sent successfully to token ${device.push_token}`
            // );
          }
        }
      }
    }

    // Log the number of notifications sent
    //console.log(`${notificationsSent} notifications sent successfully`);
  } catch (error) {
    console.error(`Error in cron job: ${error.message}`);
  }
});
