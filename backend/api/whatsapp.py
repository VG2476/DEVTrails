# FastAPI WhatsApp webhook handler for Twilio
from fastapi import APIRouter, Request, Response, status, Depends
from fastapi.responses import Response as FastAPIResponse
from backend.services.whatsapp_service import (
	handle_join, handle_status, handle_renew, handle_shift, handle_lang, handle_help, handle_appeal, log_whatsapp_message
)
import xml.etree.ElementTree as ET

router = APIRouter()

@router.post("/api/whatsapp/webhook", status_code=status.HTTP_200_OK)
async def whatsapp_webhook(request: Request):
	"""
	Handles incoming WhatsApp messages from Twilio webhook.
	Parses sender and message body, routes to appropriate handler,
	logs the message, and returns a TwiML XML response.
	"""
	form = await request.form()
	sender = form.get("From")
	body = form.get("Body", "").strip()

	# Log every incoming message
	await log_whatsapp_message(sender, body)

	# Normalize and route message
	keyword = body.split()[0].upper() if body else ""
	handlers = {
		"JOIN": handle_join,
		"STATUS": handle_status,
		"RENEW": handle_renew,
		"SHIFT": handle_shift,
		"LANG": handle_lang,
		"HELP": handle_help,
		"APPEAL": handle_appeal,
	}
	handler = handlers.get(keyword, handle_help)  # Default to HELP if unknown

	# Call the handler and get response text
	response_text = await handler(sender, body)

	# Build TwiML XML response
	twiml = ET.Element("Response")
	message = ET.SubElement(twiml, "Message")
	message.text = response_text
	xml_str = ET.tostring(twiml, encoding="utf-8")

	return FastAPIResponse(content=xml_str, media_type="application/xml")
