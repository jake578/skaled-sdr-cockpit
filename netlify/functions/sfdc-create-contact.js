// Create a new contact in SFDC and optionally link to an opportunity
export default async (req) => {
  if (req.method !== "POST") return Response.json({ error: "Method not allowed" }, { status: 405 });

  try {
    const { firstName, lastName, email, title, accountId, oppId, phone } = await req.json();
    if (!lastName || !email) return Response.json({ error: "Need at least lastName and email" }, { status: 400 });

    const cookieHeader = req.headers.get("cookie") || "";
    const sfdcMatch = cookieHeader.match(/sfdc_tokens=([^;]+)/);
    if (!sfdcMatch) return Response.json({ error: "SFDC not connected" }, { status: 401 });

    const tokens = JSON.parse(decodeURIComponent(sfdcMatch[1]));
    const headers = { Authorization: `Bearer ${tokens.access_token}`, "Content-Type": "application/json" };
    const base = `${tokens.instance_url}/services/data/v60.0/sobjects`;

    // Check if contact already exists
    const checkRes = await fetch(`${tokens.instance_url}/services/data/v60.0/query?q=${encodeURIComponent(`SELECT Id FROM Contact WHERE Email = '${email}' LIMIT 1`)}`, { headers: { Authorization: `Bearer ${tokens.access_token}` } });
    if (checkRes.ok) {
      const checkData = await checkRes.json();
      if (checkData.records?.length > 0) {
        const existingId = checkData.records[0].Id;
        // If opp provided, add contact role
        if (oppId) {
          await fetch(`${base}/OpportunityContactRole`, {
            method: "POST", headers,
            body: JSON.stringify({ OpportunityId: oppId, ContactId: existingId }),
          });
        }
        return Response.json({ success: true, contactId: existingId, existing: true, message: "Contact already exists, linked to opportunity" });
      }
    }

    // Create the contact
    const contactFields = { LastName: lastName, Email: email };
    if (firstName) contactFields.FirstName = firstName;
    if (title) contactFields.Title = title;
    if (accountId) contactFields.AccountId = accountId;
    if (phone) contactFields.Phone = phone;

    const createRes = await fetch(`${base}/Contact`, { method: "POST", headers, body: JSON.stringify(contactFields) });
    const createData = await createRes.json();

    if (!createData.success) {
      return Response.json({ error: createData.errors || "Failed to create contact" }, { status: 400 });
    }

    const contactId = createData.id;

    // Link to opportunity if provided
    if (oppId) {
      await fetch(`${base}/OpportunityContactRole`, {
        method: "POST", headers,
        body: JSON.stringify({ OpportunityId: oppId, ContactId: contactId }),
      });
    }

    return Response.json({ success: true, contactId, existing: false, message: "Contact created in Salesforce" });
  } catch (e) {
    return Response.json({ error: e.message }, { status: 500 });
  }
};

export const config = { path: "/.netlify/functions/sfdc-create-contact" };
