import { account } from '@/server/account';
import { route } from '@/server/route';

/** ST06 "Đăng xuất mọi thiết bị khác". */
export const DELETE = route({
  auth: 'user',
  handler: async () => {
    await account().signOutOthers();
    return null;
  },
});
