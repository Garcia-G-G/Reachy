import 'server-only';
import type { ChannelKey } from '@/server/config/channelTemplates';
import type { ChannelCopyExemplar, ChannelCopyExemplarFile } from './_types';
import blogOutline from './blog-outline';
import emailPitchCold from './email-pitch-cold';
import emailPitchWarm from './email-pitch-warm';
import instagramCaption from './instagram-caption';
import linkedinPostLong from './linkedin-post-long';
import linkedinPostShort from './linkedin-post-short';
import pressReleaseShort from './press-release-short';
import xThread from './x-thread';

export type { ChannelCopyExemplar, ChannelCopyExemplarFile };

const REGISTRY: Record<ChannelKey, ChannelCopyExemplarFile> = {
  'linkedin-post-long': linkedinPostLong,
  'linkedin-post-short': linkedinPostShort,
  'x-thread': xThread,
  'instagram-caption': instagramCaption,
  'email-pitch-cold': emailPitchCold,
  'email-pitch-warm': emailPitchWarm,
  'blog-outline': blogOutline,
  'press-release-short': pressReleaseShort,
};

export function channelCopyExemplarsFor(channel: ChannelKey): readonly ChannelCopyExemplar[] {
  return REGISTRY[channel]?.exemplars ?? [];
}
