// Donation receipt generation, triggered from PortalServer.js when a recipient
// confirms receipt through the token portal.
//
// PLACEHOLDER WORDING — real donation-receipt/tax language must come from
// the org before this goes live (it may have legal/tax-deduction
// implications). Everything below is filler in the same spirit as the
// placeholder-warning block in IntakeForm.html's consent section: it ships
// so the confirm-receipt flow is testable end to end, not because the copy
// is final. Do not treat any text generated here as tax or legal advice.

function generateDonationReceipt(recipientRow, matchedSubmissionId) {
  const donorRow = matchedSubmissionId ? findSubmissionById(matchedSubmissionId) : null;
  const recipientName = [recipientRow[colIndex("first_name")], recipientRow[colIndex("last_name")]]
    .filter(Boolean).join(" ");

  const doc = DocumentApp.create(`Donation Receipt - ${recipientRow[colIndex("submission_id")]}`);
  const body = doc.getBody();
  body.appendParagraph(`${getOrgName()} — Donation Receipt`).setHeading(DocumentApp.ParagraphHeading.HEADING1);
  body.appendParagraph("[PLACEHOLDER TEXT — replace with the org's real donation-receipt / tax-acknowledgment wording before launch.]");
  body.appendParagraph(`Date: ${new Date().toLocaleDateString()}`);
  body.appendParagraph(`Item: ${itemLabel(recipientRow)}`);
  body.appendParagraph(`Recipient: ${recipientName || recipientRow[colIndex("email")]}`);
  if (donorRow) {
    const donorName = [donorRow[colIndex("first_name")], donorRow[colIndex("last_name")]].filter(Boolean).join(" ");
    body.appendParagraph(`Donor: ${donorName || donorRow[colIndex("email")]}`);
  }
  doc.saveAndClose();

  const docFile = DriveApp.getFileById(doc.getId());
  const pdfBlob = docFile.getAs("application/pdf");
  const folder = getUploadFolder();
  const pdfFile = folder.createFile(pdfBlob).setName(`Receipt - ${recipientRow[colIndex("submission_id")]}.pdf`);
  docFile.setTrashed(true); // keep only the PDF; the intermediate Doc isn't needed once converted

  MailApp.sendEmail({
    to: recipientRow[colIndex("email")],
    subject: "Your Donation Receipt (PLACEHOLDER — wording pending)",
    htmlBody: `<p>Hello ${recipientRow[colIndex("first_name")]},</p>
                <p>Attached is a placeholder donation receipt confirming your item. This wording is not final —
                contact <a href="mailto:${getContactEmail()}">${getContactEmail()}</a> with questions.</p>
                <p>${getOrgName()}</p>`,
    attachments: [pdfFile.getAs(MimeType.PDF)]
  });

  return pdfFile.getUrl();
}
