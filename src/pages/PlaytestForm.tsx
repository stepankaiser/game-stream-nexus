const { success, submissionId, error } = await saveSubmissionToDynamoDB(
  submissionId,
  data.email,
  data.country,
  originalFileName,
  gameBuildS3UriPrefix,
  'MyProject/Binaries/Win64/MyProject-Win64-Shipping.exe'  // Pass executable path
); 