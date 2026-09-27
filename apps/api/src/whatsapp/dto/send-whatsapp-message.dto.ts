export interface SendWhatsappBaseDto {
  companyId: string;
  integrationId: string;
  ticketId: string;
}

export interface SendWhatsappTextDto extends SendWhatsappBaseDto {
  body: string;
  previewUrl?: boolean;
}

export interface SendWhatsappMediaDto extends SendWhatsappBaseDto {
  mediaId?: string;
  url?: string;
  caption?: string;
  fileName?: string;
}

export interface SendWhatsappTemplateDto extends SendWhatsappBaseDto {
  name: string;
  languageCode: string;
  components?: Array<Record<string, unknown>>;
}
