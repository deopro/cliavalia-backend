import { resolveEmailLocale } from '../../../../utils/email-locale';
import { getRequestAcceptLanguage } from '../../../../utils/request-email-locale-context';

export default {
  async beforeCreate(event: { params?: { data?: Record<string, unknown> } }) {
    const data = event.params?.data;
    if (!data) return;
    data.emailLocale = resolveEmailLocale(
      data.emailLocale,
      getRequestAcceptLanguage(),
    );
  },
};
